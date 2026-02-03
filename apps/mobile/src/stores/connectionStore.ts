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
      console.log('[Mobile] Connecting to session:', sessionId);
      set({ state: 'connecting', sessionId, error: null });

      // First check if the session is still active
      console.log('[Mobile] Checking session status...');
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('status')
        .eq('id', sessionId)
        .single();

      if (sessionError) {
        console.log('[Mobile] Session fetch error:', sessionError);
        throw new Error('Failed to fetch session status');
      }

      console.log('[Mobile] Session status:', session.status);
      if (session.status !== 'active') {
        set({ state: 'disconnected', error: null });
        return;
      }

      // Clean up existing channels
      if (outputChannel) {
        console.log('[Mobile] Cleaning up existing output channel');
        await supabase.removeChannel(outputChannel);
      }
      if (inputChannel) {
        console.log('[Mobile] Cleaning up existing input channel');
        await supabase.removeChannel(inputChannel);
      }

      // Subscribe to output channel
      const outputChannelName = REALTIME_CHANNELS.sessionOutput(sessionId);
      console.log('[Mobile] Subscribing to output channel:', outputChannelName);
      outputChannel = supabase.channel(outputChannelName);

      outputChannel.on('broadcast', { event: 'output' }, (payload) => {
        const message = payload.payload as RealtimeMessage;
        console.log('[Mobile] Received broadcast:', message.type, 'seq:', message.seq);

        // Handle mode messages separately
        if (message.type === 'mode' && message.permissionMode) {
          set({ permissionMode: message.permissionMode });
          return;
        }

        // Handle commands messages separately
        if (message.type === 'commands' && message.commands) {
          console.log('[Mobile] Received commands:', message.commands.length);
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
      console.log('[Mobile] Subscribing to input channel:', inputChannelName);
      inputChannel = supabase.channel(inputChannelName);

      // Wait for subscriptions
      console.log('[Mobile] Waiting for channel subscriptions...');
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          outputChannel!.subscribe((status) => {
            console.log('[Mobile] Output channel status:', status);
            if (status === 'SUBSCRIBED') resolve();
            else if (status === 'CHANNEL_ERROR') reject(new Error('Output channel error'));
          });
        }),
        new Promise<void>((resolve, reject) => {
          inputChannel!.subscribe((status) => {
            console.log('[Mobile] Input channel status:', status);
            if (status === 'SUBSCRIBED') resolve();
            else if (status === 'CHANNEL_ERROR') reject(new Error('Input channel error'));
          });
        }),
      ]);

      console.log('[Mobile] Both channels subscribed successfully');
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
    console.log('[Mobile] sendInput called, state:', get().state, 'hasChannel:', !!inputChannel);
    if (!inputChannel || get().state !== 'connected') {
      console.log('[Mobile] sendInput: Not connected, aborting');
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

    console.log('[Mobile] sendInput: Sending message seq:', message.seq, 'content length:', content.length);

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
      console.log('[Mobile] sendInput: Message sent successfully');
    } catch (error) {
      console.log('[Mobile] sendInput: Send failed:', error);
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
      console.log('[Mobile] requestCommands: Not connected');
      set({ error: 'Not connected' });
      return;
    }

    const message: RealtimeMessage = {
      type: 'commands-request',
      timestamp: Date.now(),
      seq: ++seq,
    };

    console.log('[Mobile] Sending commands-request');
    await inputChannel.send({
      type: 'broadcast',
      event: 'input',
      payload: message,
    });
    console.log('[Mobile] commands-request sent');
  },

  clearError: () => set({ error: null }),
}));
