import { EventEmitter } from 'events';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SdkSession } from './sdk-session.js';
import { SessionManager } from './session.js';
import { MachineManager } from './machine.js';
import { RealtimeClient } from '../realtime/client.js';
import type { Session, Machine, RealtimeMessage } from '@termbridge/shared';
import { NOTIFICATION_TYPES } from '@termbridge/shared';

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
        } catch (error) {
          // Silently handle broadcast errors
        }
      }

      // Check for notification triggers
      this.checkNotificationTriggers(data);
    });

    this.sdkSession.on('error', (error: Error) => {
      this.emit('error', error);
    });

    this.sdkSession.on('complete', () => {
      // Session query completed, ready for next input
      if (this.options.hybrid !== false) {
        process.stdout.write('\n> ');
      }
    });

    // Wire up input from mobile
    this.realtimeClient.on('input', async (message: RealtimeMessage) => {
      if (message.content) {
        // Remove trailing newline/carriage return for SDK
        const prompt = message.content.replace(/[\r\n]+$/, '');
        if (prompt.trim()) {
          await this.sdkSession.sendPrompt(prompt);
        }
      }
    });

    // Connect to realtime
    await this.realtimeClient.connect();

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

  async sendPrompt(prompt: string): Promise<void> {
    await this.sdkSession.sendPrompt(prompt);
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
