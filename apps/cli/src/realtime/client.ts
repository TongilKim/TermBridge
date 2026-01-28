import { EventEmitter } from 'events';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { RealtimeMessage } from '@termbridge/shared';
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

  constructor(options: RealtimeClientOptions) {
    super();
    this.supabase = options.supabase;
    this.sessionId = options.sessionId;
  }

  async connect(): Promise<void> {
    // Subscribe to output channel (CLI broadcasts to mobile)
    const outputChannelName = REALTIME_CHANNELS.sessionOutput(this.sessionId);
    this.outputChannel = this.supabase.channel(outputChannelName);

    // Subscribe to input channel (mobile sends to CLI)
    const inputChannelName = REALTIME_CHANNELS.sessionInput(this.sessionId);
    this.inputChannel = this.supabase.channel(inputChannelName);

    this.inputChannel.on('broadcast', { event: 'input' }, (payload) => {
      this.emit('input', payload.payload as RealtimeMessage);
    });

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        this.outputChannel!.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            resolve();
          } else if (status === 'CHANNEL_ERROR') {
            reject(new Error('Failed to subscribe to output channel'));
          }
        });
      }),
      new Promise<void>((resolve, reject) => {
        this.inputChannel!.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            resolve();
          } else if (status === 'CHANNEL_ERROR') {
            reject(new Error('Failed to subscribe to input channel'));
          }
        });
      }),
    ]);

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
      throw new Error('Not connected');
    }

    const message: RealtimeMessage = {
      type: 'output',
      content,
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
}
