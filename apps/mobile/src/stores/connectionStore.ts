import { create } from 'zustand';
import { supabase } from '../services/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { RealtimeMessage } from '@termbridge/shared';
import { REALTIME_CHANNELS } from '@termbridge/shared';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

interface ConnectionStoreState {
  state: ConnectionState;
  sessionId: string | null;
  messages: RealtimeMessage[];
  lastSeq: number;
  error: string | null;
  isTyping: boolean;

  // Actions
  connect: (sessionId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  sendInput: (content: string) => Promise<void>;
  clearMessages: () => void;
  clearError: () => void;
}

let outputChannel: RealtimeChannel | null = null;
let inputChannel: RealtimeChannel | null = null;
let seq = 0;

export const useConnectionStore = create<ConnectionStoreState>((set, get) => ({
  state: 'disconnected',
  sessionId: null,
  messages: [],
  lastSeq: 0,
  error: null,
  isTyping: false,

  connect: async (sessionId: string) => {
    try {
      set({ state: 'connecting', sessionId, error: null });

      // Clean up existing channels
      if (outputChannel) {
        await supabase.removeChannel(outputChannel);
      }
      if (inputChannel) {
        await supabase.removeChannel(inputChannel);
      }

      // Subscribe to output channel
      const outputChannelName = REALTIME_CHANNELS.sessionOutput(sessionId);
      outputChannel = supabase.channel(outputChannelName);

      outputChannel.on('broadcast', { event: 'output' }, (payload) => {
        const message = payload.payload as RealtimeMessage;
        set((state) => ({
          messages: [...state.messages, message],
          lastSeq: message.seq,
          isTyping: false,
        }));
      });

      // Subscribe to input channel (for sending)
      const inputChannelName = REALTIME_CHANNELS.sessionInput(sessionId);
      inputChannel = supabase.channel(inputChannelName);

      // Wait for subscriptions
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          outputChannel!.subscribe((status) => {
            if (status === 'SUBSCRIBED') resolve();
            else if (status === 'CHANNEL_ERROR') reject(new Error('Output channel error'));
          });
        }),
        new Promise<void>((resolve, reject) => {
          inputChannel!.subscribe((status) => {
            if (status === 'SUBSCRIBED') resolve();
            else if (status === 'CHANNEL_ERROR') reject(new Error('Input channel error'));
          });
        }),
      ]);

      set({ state: 'connected' });
    } catch (error) {
      set({
        state: 'disconnected',
        error: error instanceof Error ? error.message : 'Failed to connect',
      });
    }
  },

  disconnect: async () => {
    if (outputChannel) {
      await supabase.removeChannel(outputChannel);
      outputChannel = null;
    }
    if (inputChannel) {
      await supabase.removeChannel(inputChannel);
      inputChannel = null;
    }

    set({
      state: 'disconnected',
      sessionId: null,
    });
  },

  sendInput: async (content: string) => {
    if (!inputChannel || get().state !== 'connected') {
      set({ error: 'Not connected' });
      return;
    }

    const message: RealtimeMessage = {
      type: 'input',
      content,
      timestamp: Date.now(),
      seq: ++seq,
    };

    // Add input message to local state so it appears in chat
    // Set isTyping to true while waiting for Claude's response
    set((state) => ({
      messages: [...state.messages, message],
      isTyping: true,
    }));

    await inputChannel.send({
      type: 'broadcast',
      event: 'input',
      payload: message,
    });
  },

  clearMessages: () => {
    set({ messages: [], lastSeq: 0 });
  },

  clearError: () => set({ error: null }),
}));
