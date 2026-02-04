import { create } from 'zustand';
import { supabase } from '../services/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { RealtimeMessage, ImageAttachment, ModelInfo, PermissionMode, SlashCommand } from 'termbridge-shared';
import { REALTIME_CHANNELS } from 'termbridge-shared';

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
  model: string | null;
  availableModels: ModelInfo[];
  isModelChanging: boolean;

  // Actions
  connect: (sessionId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  sendInput: (content: string, attachments?: ImageAttachment[]) => Promise<void>;
  sendModeChange: (mode: PermissionMode) => Promise<void>;
  sendModelChange: (model: string) => Promise<void>;
  requestCommands: () => Promise<void>;
  requestModels: () => Promise<void>;
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
  model: null,
  availableModels: [],
  isModelChanging: false,

  connect: async (sessionId: string) => {
    try {
      // Clear previous session state including model (will be set from this session's stored model)
      set({ state: 'connecting', sessionId, error: null, messages: [], lastSeq: 0, model: null, availableModels: [], isModelChanging: false });

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

      // Fetch message history from database
      const { data: historicalMessages, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('seq', { ascending: true });

      if (!messagesError && historicalMessages && historicalMessages.length > 0) {
        const messages: RealtimeMessage[] = historicalMessages.map((msg) => ({
          type: msg.type as RealtimeMessage['type'],
          content: msg.content,
          timestamp: new Date(msg.created_at).getTime(),
          seq: msg.seq,
        }));
        const lastSeq = historicalMessages[historicalMessages.length - 1].seq;
        set({ messages, lastSeq });
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

        // Handle model messages separately
        if (message.type === 'model' && message.model) {
          set({ model: message.model, isModelChanging: false });
          return;
        }

        // Handle available models list
        if (message.type === 'models' && message.availableModels) {
          set({ availableModels: message.availableModels });
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

      // Request available commands and models from CLI
      get().requestCommands();
      get().requestModels();
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

    const sessionId = get().sessionId;
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

    // Persist input message to database for history
    if (sessionId) {
      supabase.from('messages').insert({
        session_id: sessionId,
        type: message.type,
        content: message.content,
        seq: message.seq,
      }).then(() => {}).catch(() => {
        // Silent fail - persistence is secondary
      });
    }

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

  sendModelChange: async (model: string) => {
    if (!inputChannel || get().state !== 'connected') {
      set({ error: 'Not connected' });
      return;
    }

    // Set loading state
    set({ isModelChanging: true });

    const message: RealtimeMessage = {
      type: 'model-change',
      model,
      timestamp: Date.now(),
      seq: ++seq,
    };

    await inputChannel.send({
      type: 'broadcast',
      event: 'input',
      payload: message,
    });
  },

  requestModels: async () => {
    if (!inputChannel || get().state !== 'connected') {
      set({ error: 'Not connected' });
      return;
    }

    const message: RealtimeMessage = {
      type: 'models-request',
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
