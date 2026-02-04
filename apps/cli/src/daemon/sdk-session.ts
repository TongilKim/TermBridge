import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, Query, SlashCommand as SDKSlashCommand } from '@anthropic-ai/claude-agent-sdk';
import type { ImageAttachment, ModelInfo, PermissionMode, SlashCommand } from 'termbridge-shared';

export interface SdkSessionOptions {
  cwd: string;
  allowedTools?: string[];
  permissionMode?: PermissionMode;
  model?: string;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class SdkSession extends EventEmitter {
  private options: SdkSessionOptions;
  private sessionId: string | null = null;
  private abortController: AbortController | null = null;
  private isProcessing: boolean = false;
  private currentPermissionMode: PermissionMode;
  private currentQuery: Query | null = null;
  private cachedCommands: SlashCommand[] | null = null;
  private currentModel: string = 'default';
  private conversationHistory: ConversationMessage[] = [];
  private pendingContextTransfer: boolean = false;

  constructor(options: SdkSessionOptions) {
    super();
    this.options = options;
    this.currentPermissionMode = options.permissionMode || 'default';
    this.currentModel = options.model || 'default';
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

    // Track user message in conversation history
    if (prompt.trim()) {
      this.conversationHistory.push({ role: 'user', content: prompt });
    }

    try {
      const queryOptions: Options = {
        allowedTools: this.options.allowedTools || ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
        cwd: this.options.cwd,
        abortController: this.abortController,
        permissionMode: this.currentPermissionMode,
        // Pass model directly - SDK should handle aliases like 'opus', 'sonnet', 'haiku'
        model: this.currentModel,
      };

      // Resume session if we have one
      if (this.sessionId) {
        queryOptions.resume = this.sessionId;
      }

      // Build the prompt text, including context if transferring to new session
      let finalPrompt = prompt;
      if (this.pendingContextTransfer && this.conversationHistory.length > 1) {
        // Build context from previous conversation (excluding current message)
        const previousHistory = this.conversationHistory.slice(0, -1);
        const contextLines = previousHistory.map(msg =>
          `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
        );
        const contextPrefix = `[Previous conversation context - you switched to a new model]\n${contextLines.join('\n')}\n\n[Continue with new message]\n`;
        finalPrompt = contextPrefix + prompt;
        this.pendingContextTransfer = false;
      }

      // Always use streaming input mode (AsyncIterable) to enable setModel() and setPermissionMode()
      const contentBlocks: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = [];

      // Add images if present
      if (attachments && attachments.length > 0) {
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
      }

      // Add text
      if (finalPrompt.trim()) {
        contentBlocks.push({
          type: 'text',
          text: finalPrompt,
        });
      }

      // Create async iterable for SDKUserMessage (streaming input mode)
      const sessionId = this.sessionId || '';
      async function* createUserMessage() {
        yield {
          type: 'user' as const,
          message: {
            role: 'user' as const,
            content: contentBlocks.length > 0 ? contentBlocks : [{ type: 'text', text: finalPrompt }],
          },
          parent_tool_use_id: null,
          session_id: sessionId,
        };
      }

      const queryPrompt = createUserMessage();

      this.currentQuery = query({
        prompt: queryPrompt,
        options: queryOptions,
      });

      // Track assistant response for this turn
      let assistantResponse = '';

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
                assistantResponse += block.text;
              }
            }
          }
        } else if (message.type === 'result') {
          // Final result - track assistant response in history
          if (assistantResponse.trim()) {
            this.conversationHistory.push({ role: 'assistant', content: assistantResponse.trim() });
          }
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

  async setModel(model: string): Promise<void> {
    // If model actually changed and we have an active session, prepare for context transfer
    if (model !== this.currentModel && this.sessionId) {
      this.sessionId = null;
      this.pendingContextTransfer = true;
    }

    this.currentModel = model;
    this.emit('model', model);
  }

  getModel(): string {
    return this.currentModel;
  }

  getConversationHistory(): ConversationMessage[] {
    return [...this.conversationHistory];
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  async getSupportedModels(): Promise<ModelInfo[]> {
    // Core models that should always be available
    const coreModels: ModelInfo[] = [
      { value: 'default', displayName: 'Default (recommended)', description: 'Balanced performance (default)' },
      { value: 'opus', displayName: 'Opus 4', description: 'Most capable, highest quality' },
      { value: 'haiku', displayName: 'Haiku', description: 'Fast and efficient' },
    ];

    if (!this.currentQuery) {
      return coreModels;
    }

    try {
      const sdkModels = await this.currentQuery.supportedModels();
      if (sdkModels && sdkModels.length > 0) {
        // Map SDK models
        const mappedModels = sdkModels.map((m) => ({
          value: m.value || m.name || '',
          displayName: m.displayName || m.name || '',
          description: m.description || '',
        }));

        // Ensure core models are included (they might be missing from SDK response)
        const existingValues = new Set(mappedModels.map(m => m.value));
        for (const coreModel of coreModels) {
          // Skip 'default' if SDK provides it or a sonnet variant
          if (coreModel.value === 'default') {
            const hasDefault = existingValues.has('default') ||
              mappedModels.some(m => m.value.includes('sonnet'));
            if (hasDefault) continue;
          }
          // Add core model if not present
          if (!existingValues.has(coreModel.value) &&
              !mappedModels.some(m => m.value.includes(coreModel.value))) {
            mappedModels.push(coreModel);
          }
        }

        return mappedModels;
      }
    } catch {
      // Fall through to core models
    }

    return coreModels;
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
      } catch {
        // Ignore errors scanning directories
      }
    }

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
      const existingNames = new Set(allCommands.map(c => c.name));
      const newCached = this.cachedCommands.filter(c => !existingNames.has(c.name));
      allCommands = [...allCommands, ...newCached];
    } else if (this.currentQuery) {
      // Try SDK supportedCommands() as fallback
      try {
        const sdkCommands = await this.currentQuery.supportedCommands();

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
      } catch {
        // Ignore SDK supportedCommands() errors
      }
    }

    // Add fallback commands
    const existingNames = new Set(allCommands.map(c => c.name));
    const uniqueFallbacks = fallbackCommands.filter(c => !existingNames.has(c.name));
    allCommands = [...allCommands, ...uniqueFallbacks];

    return allCommands;
  }
}
