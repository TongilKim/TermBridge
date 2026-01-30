import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, Query, SlashCommand as SDKSlashCommand } from '@anthropic-ai/claude-agent-sdk';
import type { ImageAttachment, PermissionMode, SlashCommand } from '@termbridge/shared';

export interface SdkSessionOptions {
  cwd: string;
  allowedTools?: string[];
  permissionMode?: PermissionMode;
}

export class SdkSession extends EventEmitter {
  private options: SdkSessionOptions;
  private sessionId: string | null = null;
  private abortController: AbortController | null = null;
  private isProcessing: boolean = false;
  private currentPermissionMode: PermissionMode;
  private currentQuery: Query | null = null;
  private cachedCommands: SlashCommand[] | null = null;

  constructor(options: SdkSessionOptions) {
    super();
    this.options = options;
    this.currentPermissionMode = options.permissionMode || 'bypassPermissions';
  }

  setPermissionMode(mode: PermissionMode): void {
    this.currentPermissionMode = mode;
    this.emit('permission-mode', mode);
  }

  getPermissionMode(): PermissionMode {
    return this.currentPermissionMode;
  }

  async sendPrompt(prompt: string, attachments?: ImageAttachment[]): Promise<void> {
    if (this.isProcessing) {
      this.emit('output', '\n[TermBridge] Previous request still processing...\n');
      return;
    }

    this.isProcessing = true;
    this.abortController = new AbortController();

    try {
      const queryOptions: Options = {
        allowedTools: this.options.allowedTools || ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
        cwd: this.options.cwd,
        abortController: this.abortController,
        permissionMode: this.currentPermissionMode,
      };

      // Resume session if we have one
      if (this.sessionId) {
        queryOptions.resume = this.sessionId;
      }

      // Build the prompt - either plain string or async iterable for images
      let queryPrompt: string | AsyncIterable<{ type: 'user'; message: { role: 'user'; content: unknown }; parent_tool_use_id: null; session_id: string }>;

      if (attachments && attachments.length > 0) {
        // Build content blocks array for multi-modal input
        const contentBlocks: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = [];

        // Add images first (Claude processes them in order)
        for (const attachment of attachments) {
          contentBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: attachment.mediaType,
              data: attachment.data,
            },
          });
        }

        // Add text if provided
        if (prompt.trim()) {
          contentBlocks.push({
            type: 'text',
            text: prompt,
          });
        }

        // Create async iterable for SDKUserMessage
        const sessionId = this.sessionId || '';
        async function* createUserMessage() {
          yield {
            type: 'user' as const,
            message: {
              role: 'user' as const,
              content: contentBlocks,
            },
            parent_tool_use_id: null,
            session_id: sessionId,
          };
        }

        queryPrompt = createUserMessage();
      } else {
        // Simple string prompt (original behavior)
        queryPrompt = prompt;
      }

      this.currentQuery = query({
        prompt: queryPrompt,
        options: queryOptions,
      });

      for await (const message of this.currentQuery) {
        // Handle different message types based on the SDK types
        if (message.type === 'system' && 'subtype' in message && message.subtype === 'init') {
          // Capture session ID for resuming
          this.sessionId = message.session_id;
          this.emit('session-started', this.sessionId);

          // Emit permission mode if present
          if ('permissionMode' in message) {
            this.emit('permission-mode', message.permissionMode);
          }

          // Capture slash commands from init message (includes plugins/skills)
          if ('slash_commands' in message && Array.isArray(message.slash_commands)) {
            console.log('[DEBUG] Init message has slash_commands:', message.slash_commands.length, message.slash_commands);
            // slash_commands can be either strings or objects
            this.cachedCommands = message.slash_commands.map((cmd: unknown) => {
              if (typeof cmd === 'string') {
                return { name: cmd, description: '', argumentHint: '' };
              } else if (typeof cmd === 'object' && cmd !== null) {
                const cmdObj = cmd as SDKSlashCommand;
                return {
                  name: cmdObj.name || '',
                  description: cmdObj.description || '',
                  argumentHint: cmdObj.argumentHint || '',
                };
              }
              return { name: String(cmd), description: '', argumentHint: '' };
            });
            this.emit('commands-updated', this.cachedCommands);
          }
        } else if (message.type === 'assistant') {
          // Assistant text output
          if (message.message?.content) {
            for (const block of message.message.content) {
              if ('type' in block && block.type === 'text' && 'text' in block) {
                this.emit('output', block.text);
              }
            }
          }
        } else if (message.type === 'result') {
          // Final result - don't output result.result as it duplicates assistant messages
          this.emit('complete');
        } else if (message.type === 'tool_progress') {
          // Tool progress (tool being used)
          if ('tool_name' in message) {
            this.emit('output', `\n[Using tool: ${message.tool_name}]\n`);
          }
        } else if (message.type === 'tool_use_summary') {
          // Tool use summary
          if ('tool_name' in message) {
            this.emit('output', `[Tool ${message.tool_name} completed]\n`);
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        this.emit('output', '\n[Cancelled]\n');
      } else {
        this.emit('error', error);
        this.emit('output', `\n[Error: ${(error as Error).message}]\n`);
      }
    } finally {
      this.isProcessing = false;
      this.abortController = null;
    }
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  isActive(): boolean {
    return this.isProcessing;
  }

  /**
   * Scan file system for custom commands/skills
   * Commands are in ~/.claude/commands/ and .claude/commands/
   * Subdirectories create namespaced commands (e.g., gsd/add-phase.md -> gsd:add-phase)
   */
  private scanCustomCommands(): SlashCommand[] {
    const commands: SlashCommand[] = [];
    const homeDir = os.homedir();

    // Directories to scan
    const dirs = [
      path.join(homeDir, '.claude', 'commands'),      // Personal commands
      path.join(this.options.cwd, '.claude', 'commands'), // Project commands
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            // Namespaced commands (e.g., gsd/)
            const namespace = entry.name;
            const subDir = path.join(dir, namespace);
            const subEntries = fs.readdirSync(subDir);

            for (const file of subEntries) {
              if (file.endsWith('.md')) {
                const name = `${namespace}:${file.replace('.md', '')}`;
                const description = this.extractDescription(path.join(subDir, file));
                commands.push({ name, description, argumentHint: '' });
              }
            }
          } else if (entry.isFile() && entry.name.endsWith('.md')) {
            // Top-level commands
            const name = entry.name.replace('.md', '');
            const description = this.extractDescription(path.join(dir, entry.name));
            commands.push({ name, description, argumentHint: '' });
          }
        }
      } catch (error) {
        console.log('[DEBUG] Error scanning', dir, ':', error);
      }
    }

    console.log('[DEBUG] Found', commands.length, 'custom commands from file system');
    return commands;
  }

  /**
   * Extract description from markdown file (first line or frontmatter)
   */
  private extractDescription(filePath: string): string {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // Check for frontmatter description
      if (lines[0] === '---') {
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line) continue;
          if (line === '---') break;
          if (line.startsWith('description:')) {
            return line.replace('description:', '').trim().replace(/^["']|["']$/g, '');
          }
        }
      }

      // Use first heading or first line as description
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('# ')) {
          return trimmed.replace('# ', '');
        }
        if (trimmed && !trimmed.startsWith('---')) {
          return trimmed.slice(0, 100);
        }
      }
    } catch {
      // Ignore errors
    }
    return '';
  }

  async getSupportedCommands(): Promise<SlashCommand[]> {
    // Fallback commands - known Claude Code built-in commands
    // Sources: https://shipyard.build/blog/claude-code-cheat-sheet/
    //          https://www.eesel.ai/blog/slash-commands-claude-code
    const fallbackCommands: SlashCommand[] = [
      // Session management
      { name: 'help', description: 'Show all commands and custom slash commands', argumentHint: '' },
      { name: 'clear', description: 'Clear the conversation history', argumentHint: '' },
      { name: 'compact', description: 'Compress conversation by summarizing older messages', argumentHint: '' },
      { name: 'rewind', description: 'Go back to a previous message in the session', argumentHint: '' },
      { name: 'context', description: 'Check context and excluded skills', argumentHint: '' },
      // Configuration
      { name: 'config', description: 'Configure Claude Code settings interactively', argumentHint: '' },
      { name: 'permissions', description: 'View or update tool permissions', argumentHint: '' },
      { name: 'allowed-tools', description: 'Configure tool permissions interactively', argumentHint: '' },
      { name: 'model', description: 'Change the AI model', argumentHint: '' },
      { name: 'vim', description: 'Enable vim-style editing mode', argumentHint: '' },
      // Integrations
      { name: 'hooks', description: 'Configure hooks', argumentHint: '' },
      { name: 'mcp', description: 'Manage MCP servers', argumentHint: '' },
      { name: 'agents', description: 'Manage subagents (create, edit, list)', argumentHint: '' },
      { name: 'terminal-setup', description: 'Install terminal shortcuts for iTerm2/VS Code', argumentHint: '' },
      { name: 'install-github-app', description: 'Set up GitHub Actions integration', argumentHint: '' },
      { name: 'ide', description: 'Open in IDE or configure IDE integration', argumentHint: '' },
      // Project
      { name: 'init', description: 'Initialize Claude Code and generate CLAUDE.md', argumentHint: '' },
      { name: 'memory', description: 'Edit CLAUDE.md memory file', argumentHint: '' },
      { name: 'add-dir', description: 'Add a directory to the context', argumentHint: '<path>' },
      // Git & Code Review
      { name: 'commit', description: 'Commit changes to git with a generated message', argumentHint: '' },
      { name: 'review', description: 'Review code changes', argumentHint: '' },
      { name: 'review-pr', description: 'Review a GitHub pull request', argumentHint: '<pr-url>' },
      { name: 'pr-comments', description: 'Get comments from a GitHub pull request', argumentHint: '' },
      { name: 'release-notes', description: 'Generate release notes', argumentHint: '' },
      { name: 'security-review', description: 'Perform a security review', argumentHint: '' },
      // Account & System
      { name: 'login', description: 'Log in to your Anthropic account', argumentHint: '' },
      { name: 'logout', description: 'Log out of your Anthropic account', argumentHint: '' },
      { name: 'doctor', description: 'Check Claude Code health and configuration', argumentHint: '' },
      { name: 'bug', description: 'Report a bug to Anthropic', argumentHint: '' },
      { name: 'cost', description: 'Show token usage and cost', argumentHint: '' },
      { name: 'status', description: 'Show current session status', argumentHint: '' },
      { name: 'keybindings-help', description: 'Show keyboard shortcuts', argumentHint: '' },
    ];

    // Get custom commands from file system (includes gsd:* etc.)
    const customCommands = this.scanCustomCommands();

    // Start with all commands
    let allCommands: SlashCommand[] = [...customCommands];

    // Add cached commands from init message
    if (this.cachedCommands && this.cachedCommands.length > 0) {
      console.log('[DEBUG] Using cached commands from init:', this.cachedCommands.length);
      const existingNames = new Set(allCommands.map(c => c.name));
      const newCached = this.cachedCommands.filter(c => !existingNames.has(c.name));
      allCommands = [...allCommands, ...newCached];
    } else if (this.currentQuery) {
      // Try SDK supportedCommands() as fallback
      try {
        console.log('[DEBUG] Calling SDK supportedCommands()...');
        const sdkCommands = await this.currentQuery.supportedCommands();
        console.log('[DEBUG] SDK returned', sdkCommands.length, 'commands');

        const existingNames = new Set(allCommands.map(c => c.name));
        for (const cmd of sdkCommands) {
          if (!existingNames.has(cmd.name)) {
            allCommands.push({
              name: cmd.name,
              description: cmd.description,
              argumentHint: cmd.argumentHint || '',
            });
          }
        }
      } catch (error) {
        console.log('[DEBUG] SDK supportedCommands() error:', error);
      }
    }

    // Add fallback commands
    const existingNames = new Set(allCommands.map(c => c.name));
    const uniqueFallbacks = fallbackCommands.filter(c => !existingNames.has(c.name));
    allCommands = [...allCommands, ...uniqueFallbacks];

    console.log('[DEBUG] Total commands:', allCommands.length);
    return allCommands;
  }
}
