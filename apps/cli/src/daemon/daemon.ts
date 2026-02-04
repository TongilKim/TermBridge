import { EventEmitter } from 'events';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SdkSession } from './sdk-session.js';
import { SessionManager } from './session.js';
import { MachineManager } from './machine.js';
import { RealtimeClient } from '../realtime/client.js';
import type { Session, Machine, RealtimeMessage, ImageAttachment, PermissionMode } from 'termbridge-shared';
import { NOTIFICATION_TYPES } from 'termbridge-shared';

export interface DaemonOptions {
  supabase: SupabaseClient;
  userId: string;
  machineId?: string;
  machineName?: string;
  cwd: string;
  hybrid?: boolean;
}

export class Daemon extends EventEmitter {
  private options: DaemonOptions;
  private sdkSession: SdkSession;
  private sessionManager: SessionManager;
  private machineManager: MachineManager;
  private realtimeClient: RealtimeClient | null = null;
  private machine: Machine | null = null;
  private session: Session | null = null;
  private running: boolean = false;
  private commandsBroadcast: boolean = false;
  private sdkCommandsBroadcast: boolean = false;

  constructor(options: DaemonOptions) {
    super();
    this.options = options;

    this.sdkSession = new SdkSession({
      cwd: options.cwd,
    });

    this.sessionManager = new SessionManager({
      supabase: options.supabase,
    });

    this.machineManager = new MachineManager({
      supabase: options.supabase,
    });
  }

  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Daemon is already running');
    }

    // Register machine
    this.machine = await this.machineManager.registerMachine(
      this.options.userId,
      this.options.machineName,
      this.options.machineId
    );

    // Create session
    this.session = await this.sessionManager.createSession(
      this.machine.id,
      this.options.cwd
    );

    // Initialize realtime client
    this.realtimeClient = new RealtimeClient({
      supabase: this.options.supabase,
      sessionId: this.session.id,
    });

    // Wire up SDK session output to broadcast
    this.sdkSession.on('output', async (data: string) => {
      // Hybrid mode: output to local stdout
      if (this.options.hybrid !== false) {
        process.stdout.write(data);
      }

      // Broadcast to mobile
      if (this.realtimeClient) {
        try {
          await this.realtimeClient.broadcast(data);
        } catch {
          // Silently handle broadcast errors
        }
      }

      // Check for notification triggers
      this.checkNotificationTriggers(data);
    });

    this.sdkSession.on('error', (error: Error) => {
      this.emit('error', error);
    });

    // Broadcast commands when they're updated from init message (includes plugins/skills)
    this.sdkSession.on('commands-updated', async () => {
      await this.broadcastCommands();
    });

    this.sdkSession.on('complete', async () => {
      // Session query completed, ready for next input
      if (this.options.hybrid !== false) {
        process.stdout.write('\n> ');
      }

      // Broadcast real SDK commands (including custom skills) after first query completion
      // This updates the fallback commands with the full list from the SDK
      if (!this.sdkCommandsBroadcast && this.realtimeClient) {
        this.sdkCommandsBroadcast = true;
        await this.broadcastCommands();
      }
    });

    // Wire up permission mode changes to broadcast
    this.sdkSession.on('permission-mode', async (mode: PermissionMode) => {
      if (this.realtimeClient) {
        try {
          await this.realtimeClient.broadcastMode(mode);
        } catch {
          // Silently handle broadcast errors
        }
      }
    });

    // Wire up model changes to broadcast
    this.sdkSession.on('model', async (model: string) => {
      if (this.realtimeClient) {
        try {
          await this.realtimeClient.broadcastModel(model);
        } catch {
          // Silently handle broadcast errors
        }
      }
    });

    // Wire up input from mobile
    this.realtimeClient.on('input', async (message: RealtimeMessage) => {
      // Broadcast commands on first message from mobile if not already done
      if (!this.commandsBroadcast) {
        this.commandsBroadcast = true;
        await this.broadcastCommands();
      }

      // Handle mode change requests
      if (message.type === 'mode-change' && message.permissionMode) {
        this.sdkSession.setPermissionMode(message.permissionMode);
        // Broadcast the new mode back to confirm
        if (this.realtimeClient) {
          try {
            await this.realtimeClient.broadcastMode(message.permissionMode);
          } catch {
            // Silently handle broadcast errors
          }
        }
        return;
      }

      // Handle commands request
      if (message.type === 'commands-request') {
        await this.broadcastCommands();
        return;
      }

      // Handle model change requests
      if (message.type === 'model-change' && message.model) {
        const previousModel = this.sdkSession.getModel();
        await this.sdkSession.setModel(message.model);

        // Output confirmation message if model actually changed
        if (previousModel !== message.model) {
          const modelNames: Record<string, string> = {
            'default': 'Sonnet 4',
            'sonnet': 'Sonnet 4',
            'opus': 'Opus 4',
            'haiku': 'Haiku 3.5',
          };
          const displayName = modelNames[message.model] || message.model;
          const confirmationMsg = `\n[Model switched to ${displayName}]\n`;

          // Output to local terminal
          if (this.options.hybrid !== false) {
            process.stdout.write(confirmationMsg);
          }

          // Broadcast to mobile
          if (this.realtimeClient) {
            try {
              await this.realtimeClient.broadcast(confirmationMsg);
            } catch {
              // Silently handle broadcast errors
            }
          }
        }
        return;
      }

      // Handle models request
      if (message.type === 'models-request') {
        await this.broadcastModels();
        return;
      }

      // Remove trailing newline/carriage return for SDK
      const prompt = message.content?.replace(/[\r\n]+$/, '') || '';
      const attachments = message.attachments;

      // Send if there's text or attachments
      if (prompt.trim() || (attachments && attachments.length > 0)) {
        await this.sdkSession.sendPrompt(prompt, attachments);
      }
    });

    // Connect to realtime
    await this.realtimeClient.connect();

    // Broadcast initial permission mode
    try {
      await this.realtimeClient.broadcastMode(this.sdkSession.getPermissionMode());
    } catch {
      // Silently handle broadcast errors
    }

    // Broadcast available commands immediately
    await this.broadcastCommands();

    // Broadcast available models immediately
    await this.broadcastModels();

    // Broadcast current model
    try {
      await this.realtimeClient.broadcastModel(this.sdkSession.getModel());
    } catch {
      // Silently handle broadcast errors
    }

    this.running = true;
    this.emit('started', {
      machine: this.machine,
      session: this.session,
      mobileSyncEnabled: this.realtimeClient?.isRealtimeEnabled() ?? false,
    });

    // Show initial prompt
    if (this.options.hybrid !== false) {
      process.stdout.write('\n[TermBridge] Ready for input.\n> ');
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    // Cancel any ongoing SDK operation
    this.sdkSession.cancel();

    // End session
    if (this.session) {
      await this.sessionManager.endSession(this.session.id);
    }

    // Update machine status
    if (this.machine) {
      await this.machineManager.updateMachineStatus(this.machine.id, 'offline');
    }

    // Disconnect realtime
    if (this.realtimeClient) {
      await this.realtimeClient.disconnect();
    }

    this.emit('stopped');
  }

  async sendPrompt(prompt: string, attachments?: ImageAttachment[]): Promise<void> {
    await this.sdkSession.sendPrompt(prompt, attachments);
  }

  isRunning(): boolean {
    return this.running;
  }

  getSession(): Session | null {
    return this.session;
  }

  getMachine(): Machine | null {
    return this.machine;
  }

  private async broadcastCommands(): Promise<void> {
    if (!this.realtimeClient) {
      return;
    }

    try {
      const commands = await this.sdkSession.getSupportedCommands();
      await this.realtimeClient.broadcastCommands(commands);
    } catch {
      // Silently handle broadcast errors
    }
  }

  private async broadcastModels(): Promise<void> {
    if (!this.realtimeClient) {
      return;
    }

    try {
      const models = await this.sdkSession.getSupportedModels();
      await this.realtimeClient.broadcastModels(models);
    } catch {
      // Silently handle broadcast errors
    }
  }

  private checkNotificationTriggers(output: string): void {
    const lowerOutput = output.toLowerCase();

    // Check for task completion indicators
    if (
      lowerOutput.includes('task complete') ||
      lowerOutput.includes('done') ||
      lowerOutput.includes('finished')
    ) {
      this.emit('notification', {
        type: NOTIFICATION_TYPES.TASK_COMPLETE,
        message: 'Task completed',
      });
    }

    // Check for error indicators
    if (
      lowerOutput.includes('error') ||
      lowerOutput.includes('failed') ||
      lowerOutput.includes('exception')
    ) {
      this.emit('notification', {
        type: NOTIFICATION_TYPES.ERROR,
        message: 'Error detected',
      });
    }

    // Check for input required indicators
    if (
      lowerOutput.includes('y/n') ||
      lowerOutput.includes('[y/n]') ||
      lowerOutput.includes('press enter') ||
      lowerOutput.includes('continue?')
    ) {
      this.emit('notification', {
        type: NOTIFICATION_TYPES.INPUT_REQUIRED,
        message: 'Input required',
      });
    }
  }
}
