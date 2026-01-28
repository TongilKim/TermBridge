import { EventEmitter } from 'events';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PtyManager } from './pty.js';
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
  command: string;
  args: string[];
  cwd: string;
  hybrid?: boolean;
}

export class Daemon extends EventEmitter {
  private options: DaemonOptions;
  private ptyManager: PtyManager;
  private sessionManager: SessionManager;
  private machineManager: MachineManager;
  private realtimeClient: RealtimeClient | null = null;
  private machine: Machine | null = null;
  private session: Session | null = null;
  private running: boolean = false;

  constructor(options: DaemonOptions) {
    super();
    this.options = options;

    this.ptyManager = new PtyManager();
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

    // Wire up PTY output to broadcast
    this.ptyManager.on('output', async (data: string) => {
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

    // Wire up PTY exit
    this.ptyManager.on('exit', async (code: number) => {
      this.emit('exit', code);
      await this.stop();
    });

    // Wire up input from mobile
    this.realtimeClient.on('input', (message: RealtimeMessage) => {
      if (message.content) {
        this.ptyManager.write(message.content);
      }
    });

    // Connect to realtime
    await this.realtimeClient.connect();

    this.running = true;
    this.emit('started', { machine: this.machine, session: this.session });

    // Start PTY (after emitting started so success message shows first)
    await this.ptyManager.spawn(
      this.options.command,
      this.options.args,
      this.options.cwd
    );
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    // Kill PTY
    this.ptyManager.kill();

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

  write(data: string): void {
    this.ptyManager.write(data);
  }

  resize(cols: number, rows: number): void {
    this.ptyManager.resize(cols, rows);
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
