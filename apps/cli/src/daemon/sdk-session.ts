import { EventEmitter } from 'events';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options } from '@anthropic-ai/claude-agent-sdk';

export interface SdkSessionOptions {
  cwd: string;
  allowedTools?: string[];
}

export class SdkSession extends EventEmitter {
  private options: SdkSessionOptions;
  private sessionId: string | null = null;
  private abortController: AbortController | null = null;
  private isProcessing: boolean = false;

  constructor(options: SdkSessionOptions) {
    super();
    this.options = options;
  }

  async sendPrompt(prompt: string): Promise<void> {
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
        permissionMode: 'bypassPermissions',
      };

      // Resume session if we have one
      if (this.sessionId) {
        queryOptions.resume = this.sessionId;
      }

      for await (const message of query({
        prompt,
        options: queryOptions,
      })) {
        // Handle different message types based on the SDK types
        if (message.type === 'system' && 'subtype' in message && message.subtype === 'init') {
          // Capture session ID for resuming
          this.sessionId = message.session_id;
          this.emit('session-started', this.sessionId);
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
}
