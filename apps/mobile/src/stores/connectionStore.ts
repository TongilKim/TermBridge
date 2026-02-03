import { create } from 'zustand';
import { supabase } from '../services/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { RealtimeMessage, ImageAttachment, PermissionMode, SlashCommand } from '@termbridge/shared';
import { REALTIME_CHANNELS } from '@termbridge/shared';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

interface ConnectionStoreState {
  state: ConnectionState;
  sessionId: string | null;
  messages: RealtimeMessage[];
  lastSeq: number;
  error: string | null;
  isTyping: boolean;
  permissionMode: PermissionMode | null;
  commands: SlashCommand[];

  // Actions
  connect: (sessionId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  sendInput: (content: string, attachments?: ImageAttachment[]) => Promise<void>;
  sendModeChange: (mode: PermissionMode) => Promise<void>;
  requestCommands: () => Promise<void>;
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
  permissionMode: null,
  commands: [],

  connect: async (sessionId: string) => {
    try {
      set({ state: 'connecting', sessionId, error: null });

      // First check if the session is still active
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('status')
        .eq('id', sessionId)
        .single();

      if (sessionError) {
        throw new Error('Failed to fetch session status');
      }

      if (session.status !== 'active') {
        set({ state: 'disconnected', error: null });
        return;
      }

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

        // Handle mode messages separately
        if (message.type === 'mode' && message.permissionMode) {
          set({ permissionMode: message.permissionMode });
          return;
        }

        // Handle commands messages separately
        if (message.type === 'commands' && message.commands) {
          set({ commands: message.commands });
          return;
        }

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

      // Request available commands from CLI
      get().requestCommands();
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

  sendInput: async (content: string, attachments?: ImageAttachment[]) => {
    if (!inputChannel || get().state !== 'connected') {
      set({ error: 'Not connected' });
      return;
    }

    const message: RealtimeMessage = {
      type: 'input',
      content,
      attachments,
      timestamp: Date.now(),
      seq: ++seq,
    };

    // Add input message to local state so it appears in chat
    // Set isTyping to true while waiting for Claude's response
    set((state) => ({
      messages: [...state.messages, message],
      isTyping: true,
    }));

    try {
      await inputChannel.send({
        type: 'broadcast',
        event: 'input',
        payload: message,
      });
    } catch {
      set({ error: 'Failed to send message' });
    }
  },

  clearMessages: () => {
    set({ messages: [], lastSeq: 0 });
  },

  sendModeChange: async (mode: PermissionMode) => {
    if (!inputChannel || get().state !== 'connected') {
      set({ error: 'Not connected' });
      return;
    }

    const message: RealtimeMessage = {
      type: 'mode-change',
      permissionMode: mode,
      timestamp: Date.now(),
      seq: ++seq,
    };

    await inputChannel.send({
      type: 'broadcast',
      event: 'input',
      payload: message,
    });
  },

  requestCommands: async () => {
    if (!inputChannel || get().state !== 'connected') {
      set({ error: 'Not connected' });
      return;
    }

    const message: RealtimeMessage = {
      type: 'commands-request',
      timestamp: Date.now(),
      seq: ++seq,
    };

    await inputChannel.send({
      type: 'broadcast',
      event: 'input',
      payload: message,
    });
  },

  clearError: () => set({ error: null }),
}));
