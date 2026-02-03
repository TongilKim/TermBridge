import { EventEmitter } from 'events';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { RealtimeMessage, PermissionMode, SlashCommand } from '@termbridge/shared';
import { REALTIME_CHANNELS } from '@termbridge/shared';

export interface RealtimeClientOptions {
  supabase: SupabaseClient;
  sessionId: string;
}

export class RealtimeClient extends EventEmitter {
  private supabase: SupabaseClient;
  private sessionId: string;
  private outputChannel: RealtimeChannel | null = null;
  private inputChannel: RealtimeChannel | null = null;
  private seq: number = 0;
  private realtimeEnabled: boolean = false;

  constructor(options: RealtimeClientOptions) {
    super();
    this.supabase = options.supabase;
    this.sessionId = options.sessionId;
  }

  async connect(): Promise<void> {
    console.log('[DEBUG] RealtimeClient.connect: Starting connection for session:', this.sessionId);

    // Subscribe to output channel (CLI broadcasts to mobile)
    const outputChannelName = REALTIME_CHANNELS.sessionOutput(this.sessionId);
    console.log('[DEBUG] RealtimeClient.connect: Output channel:', outputChannelName);
    this.outputChannel = this.supabase.channel(outputChannelName);

    // Subscribe to input channel (mobile sends to CLI)
    const inputChannelName = REALTIME_CHANNELS.sessionInput(this.sessionId);
    console.log('[DEBUG] RealtimeClient.connect: Input channel:', inputChannelName);
    this.inputChannel = this.supabase.channel(inputChannelName);

    this.inputChannel.on('broadcast', { event: 'input' }, (payload) => {
      console.log('[DEBUG] RealtimeClient: Received input event');
      this.emit('input', payload.payload as RealtimeMessage);
    });

    const SUBSCRIPTION_TIMEOUT = 10000; // 10 second timeout

    const subscribeWithTimeout = (
      channel: RealtimeChannel,
      channelName: string
    ): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          // Resolve with warning instead of rejecting - allows CLI to work without realtime
          console.warn(
            `[WARN] Realtime subscription timeout for ${channelName}. Mobile sync disabled.`
          );
          resolve(false);
        }, SUBSCRIPTION_TIMEOUT);

        channel.subscribe((status, err) => {
          // Debug: log all status changes
          if (process.env['DEBUG']) {
            console.log(`[DEBUG] Channel ${channelName} status: ${status}`, err || '');
          }

          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout);
            resolve(true);
          } else if (status === 'CHANNEL_ERROR') {
            clearTimeout(timeout);
            // Resolve with warning instead of rejecting
            console.warn(
              `[WARN] Failed to subscribe to ${channelName}. Mobile sync disabled.`
            );
            if (err) {
              console.warn(`[WARN] Error details: ${err.message || err}`);
            }
            resolve(false);
          } else if (status === 'CLOSED') {
            clearTimeout(timeout);
            console.warn(
              `[WARN] Channel ${channelName} closed. Mobile sync disabled.`
            );
            resolve(false);
          } else if (status === 'TIMED_OUT') {
            clearTimeout(timeout);
            console.warn(
              `[WARN] Channel ${channelName} timed out. Check your network connection.`
            );
            resolve(false);
          }
        });
      });
    };

    const results = await Promise.all([
      subscribeWithTimeout(this.outputChannel, 'output'),
      subscribeWithTimeout(this.inputChannel, 'input'),
    ]);

    // Only enable realtime if both channels subscribed successfully
    this.realtimeEnabled = results.every((success) => success);

    this.emit('connected');
  }

  async disconnect(): Promise<void> {
    if (this.outputChannel) {
      await this.supabase.removeChannel(this.outputChannel);
      this.outputChannel = null;
    }

    if (this.inputChannel) {
      await this.supabase.removeChannel(this.inputChannel);
      this.inputChannel = null;
    }

    this.emit('disconnected');
  }

  async broadcast(content: string): Promise<void> {
    if (!this.outputChannel) {
      console.log('[DEBUG] RealtimeClient.broadcast: No output channel');
      throw new Error('Not connected');
    }

    // Skip broadcasting if realtime is not enabled
    if (!this.realtimeEnabled) {
      console.log('[DEBUG] RealtimeClient.broadcast: Realtime not enabled, skipping');
      return;
    }

    const message: RealtimeMessage = {
      type: 'output',
      content,
      timestamp: Date.now(),
      seq: ++this.seq,
    };

    console.log('[DEBUG] RealtimeClient.broadcast: Sending seq:', message.seq, 'content length:', content.length);

    try {
      await this.outputChannel.send({
        type: 'broadcast',
        event: 'output',
        payload: message,
      });
      console.log('[DEBUG] RealtimeClient.broadcast: Sent successfully');
    } catch (error) {
      console.log('[DEBUG] RealtimeClient.broadcast: Send failed:', error);
      throw error;
    }

    this.emit('broadcast', message);
  }

  async broadcastMode(mode: PermissionMode): Promise<void> {
    if (!this.outputChannel) {
      throw new Error('Not connected');
    }

    // Skip broadcasting if realtime is not enabled
    if (!this.realtimeEnabled) {
      return;
    }

    const message: RealtimeMessage = {
      type: 'mode',
      permissionMode: mode,
      timestamp: Date.now(),
      seq: ++this.seq,
    };

    await this.outputChannel.send({
      type: 'broadcast',
      event: 'output',
      payload: message,
    });

    this.emit('broadcast', message);
  }

  async broadcastCommands(commands: SlashCommand[]): Promise<void> {
    if (!this.outputChannel) {
      throw new Error('Not connected');
    }

    // Skip broadcasting if realtime is not enabled
    if (!this.realtimeEnabled) {
      console.log('[DEBUG] RealtimeClient.broadcastCommands: Realtime not enabled, skipping');
      return;
    }
    console.log('[DEBUG] RealtimeClient.broadcastCommands: Broadcasting', commands.length, 'commands');

    const message: RealtimeMessage = {
      type: 'commands',
      commands,
      timestamp: Date.now(),
      seq: ++this.seq,
    };

    await this.outputChannel.send({
      type: 'broadcast',
      event: 'output',
      payload: message,
    });

    this.emit('broadcast', message);
  }

  getSeq(): number {
    return this.seq;
  }

  isConnected(): boolean {
    return this.outputChannel !== null && this.inputChannel !== null;
  }

  isRealtimeEnabled(): boolean {
    return this.realtimeEnabled;
  }
}
