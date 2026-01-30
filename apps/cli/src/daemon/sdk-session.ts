import { EventEmitter } from 'events';
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

  async getSupportedCommands(): Promise<SlashCommand[]> {
    // Use SDK method if query is available
    if (this.currentQuery) {
      try {
        const sdkCommands = await this.currentQuery.supportedCommands();
        return sdkCommands.map((cmd: SDKSlashCommand) => ({
          name: cmd.name,
          description: cmd.description,
          argumentHint: cmd.argumentHint || '',
        }));
      } catch (error) {
        // Fall back to default commands if SDK call fails
      }
    }

    // Fallback: Return known Claude Code slash commands
    return [
      { name: 'commit', description: 'Commit changes to git with a generated message', argumentHint: '' },
      { name: 'help', description: 'Show available commands and usage', argumentHint: '' },
      { name: 'review-pr', description: 'Review a GitHub pull request', argumentHint: '<pr-url>' },
      { name: 'clear', description: 'Clear the conversation history', argumentHint: '' },
      { name: 'compact', description: 'Compact the conversation to save context', argumentHint: '' },
      { name: 'bug', description: 'Report a bug to Anthropic', argumentHint: '' },
      { name: 'init', description: 'Initialize Claude Code in the current directory', argumentHint: '' },
      { name: 'memory', description: 'Edit CLAUDE.md memory file', argumentHint: '' },
      { name: 'model', description: 'Change the AI model', argumentHint: '' },
      { name: 'cost', description: 'Show token usage and cost', argumentHint: '' },
    ];
  }
}
