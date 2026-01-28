import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RealtimeClient } from '../realtime/client.js';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { REALTIME_CHANNELS } from '@termbridge/shared';

describe('RealtimeClient', () => {
  let mockSupabase: Partial<SupabaseClient>;
  let mockOutputChannel: Partial<RealtimeChannel>;
  let mockInputChannel: Partial<RealtimeChannel>;
  let subscribeCallback: ((status: string) => void) | null = null;

  beforeEach(() => {
    subscribeCallback = null;

    mockOutputChannel = {
      subscribe: vi.fn((cb) => {
        setTimeout(() => cb('SUBSCRIBED'), 0);
        return mockOutputChannel as RealtimeChannel;
      }),
      send: vi.fn().mockResolvedValue({ error: null }),
      on: vi.fn().mockReturnThis(),
    };

    mockInputChannel = {
      subscribe: vi.fn((cb) => {
        setTimeout(() => cb('SUBSCRIBED'), 0);
        return mockInputChannel as RealtimeChannel;
      }),
      send: vi.fn().mockResolvedValue({ error: null }),
      on: vi.fn().mockReturnThis(),
    };

    let channelCount = 0;
    mockSupabase = {
      channel: vi.fn((name) => {
        if (name.includes('output')) {
          return mockOutputChannel as RealtimeChannel;
        }
        return mockInputChannel as RealtimeChannel;
      }),
      removeChannel: vi.fn().mockResolvedValue({ error: null }),
    };
  });

  it('should create RealtimeClient with session ID', () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    expect(client).toBeDefined();
  });

  it('should connect to output channel with session ID', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    await client.connect();

    const expectedOutputChannel = REALTIME_CHANNELS.sessionOutput(
      'test-session-123'
    );
    expect(mockSupabase.channel).toHaveBeenCalledWith(expectedOutputChannel);
  });

  it('should connect to input channel with session ID', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    await client.connect();

    const expectedInputChannel = REALTIME_CHANNELS.sessionInput(
      'test-session-123'
    );
    expect(mockSupabase.channel).toHaveBeenCalledWith(expectedInputChannel);
  });

  it('should emit connected event when channels subscribe successfully', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    const connectedCallback = vi.fn();
    client.on('connected', connectedCallback);

    await client.connect();

    expect(connectedCallback).toHaveBeenCalled();
  });

  it('should disconnect from all channels', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    await client.connect();
    await client.disconnect();

    expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(2);
  });

  it('should emit disconnected event when disconnecting', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    const disconnectedCallback = vi.fn();
    client.on('disconnected', disconnectedCallback);

    await client.connect();
    await client.disconnect();

    expect(disconnectedCallback).toHaveBeenCalled();
  });

  it('should broadcast output messages to output channel', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    await client.connect();
    await client.broadcast('test output');

    expect(mockOutputChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'broadcast',
        event: 'output',
        payload: expect.objectContaining({
          type: 'output',
          content: 'test output',
        }),
      })
    );
  });

  it('should increment sequence number on each broadcast', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    await client.connect();

    await client.broadcast('message 1');
    expect(client.getSeq()).toBe(1);

    await client.broadcast('message 2');
    expect(client.getSeq()).toBe(2);

    await client.broadcast('message 3');
    expect(client.getSeq()).toBe(3);
  });

  it('should emit input event when receiving input from mobile', async () => {
    let inputHandler: ((payload: any) => void) | null = null;

    mockInputChannel.on = vi.fn((event, filter, handler) => {
      if (event === 'broadcast' && filter.event === 'input') {
        inputHandler = handler;
      }
      return mockInputChannel as RealtimeChannel;
    });

    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    const inputCallback = vi.fn();
    client.on('input', inputCallback);

    await client.connect();

    // Simulate receiving input from mobile
    if (inputHandler) {
      inputHandler({
        payload: {
          type: 'input',
          content: 'user input',
          timestamp: Date.now(),
          seq: 1,
        },
      });
    }

    expect(inputCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'input',
        content: 'user input',
      })
    );
  });

  it('should report connected status correctly', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    expect(client.isConnected()).toBe(false);

    await client.connect();
    expect(client.isConnected()).toBe(true);

    await client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('should throw error when broadcasting without connection', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    await expect(client.broadcast('test')).rejects.toThrow('Not connected');
  });
});
