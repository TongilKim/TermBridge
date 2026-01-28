import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock all dependencies before importing Daemon
vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  })),
}));

import { Daemon } from '../daemon/daemon.js';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { NOTIFICATION_TYPES } from '@termbridge/shared';

describe('Daemon', () => {
  let mockSupabase: Partial<SupabaseClient>;
  let daemon: Daemon | null = null;
  let mockOutputChannel: Partial<RealtimeChannel>;
  let mockInputChannel: Partial<RealtimeChannel>;

  const mockMachine = {
    id: 'machine-123',
    user_id: 'user-456',
    name: 'Test Machine',
    hostname: 'test-host',
    status: 'online',
    last_seen_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  const mockSession = {
    id: 'session-789',
    machine_id: 'machine-123',
    status: 'active',
    working_directory: '/home/user',
    started_at: new Date().toISOString(),
    ended_at: null,
  };

  // Helper to create chainable eq mock
  const createChainableEq = (finalResult: any) => {
    const eqMock: any = vi.fn();
    eqMock.mockReturnValue({
      eq: eqMock,
      single: vi.fn().mockResolvedValue(finalResult),
      order: vi.fn().mockResolvedValue(finalResult),
    });
    return eqMock;
  };

  beforeEach(() => {
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

    mockSupabase = {
      from: vi.fn((table) => {
        if (table === 'machines') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockMachine, error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
            select: vi.fn().mockReturnValue({
              eq: createChainableEq({
                data: null,
                error: { code: 'PGRST116', message: 'Not found' },
              }),
            }),
          };
        }
        if (table === 'sessions') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockSession, error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {};
      }),
      channel: vi.fn((name) => {
        if (name.includes('output')) {
          return mockOutputChannel as RealtimeChannel;
        }
        return mockInputChannel as RealtimeChannel;
      }),
      removeChannel: vi.fn().mockResolvedValue({ error: null }),
    };
  });

  afterEach(async () => {
    if (daemon && daemon.isRunning()) {
      await daemon.stop();
    }
    daemon = null;
  });

  it('should create daemon with options', () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      command: 'echo',
      args: ['hello'],
      cwd: '/home/user',
    });

    expect(daemon).toBeDefined();
  });

  it('should register machine on start', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      command: 'echo',
      args: ['hello'],
      cwd: '/home/user',
    });

    await daemon.start();

    expect(mockSupabase.from).toHaveBeenCalledWith('machines');
    expect(daemon.getMachine()).toBeDefined();
    expect(daemon.getMachine()?.id).toBe('machine-123');
  });

  it('should create session on start', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      command: 'echo',
      args: ['hello'],
      cwd: '/home/user',
    });

    await daemon.start();

    expect(mockSupabase.from).toHaveBeenCalledWith('sessions');
    expect(daemon.getSession()).toBeDefined();
    expect(daemon.getSession()?.id).toBe('session-789');
  });

  it('should connect to realtime channels on start', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      command: 'echo',
      args: ['hello'],
      cwd: '/home/user',
    });

    await daemon.start();

    expect(mockSupabase.channel).toHaveBeenCalled();
    expect(mockOutputChannel.subscribe).toHaveBeenCalled();
    expect(mockInputChannel.subscribe).toHaveBeenCalled();
  });

  it('should emit started event on start', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      command: 'echo',
      args: ['hello'],
      cwd: '/home/user',
    });

    const startedCallback = vi.fn();
    daemon.on('started', startedCallback);

    await daemon.start();

    expect(startedCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        machine: expect.any(Object),
        session: expect.any(Object),
      })
    );
  });

  it('should end session on stop', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      command: 'echo',
      args: ['hello'],
      cwd: '/home/user',
    });

    await daemon.start();
    await daemon.stop();

    // Verify session update was called
    expect(mockSupabase.from).toHaveBeenCalledWith('sessions');
  });

  it('should update machine status to offline on stop', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      command: 'echo',
      args: ['hello'],
      cwd: '/home/user',
    });

    await daemon.start();
    await daemon.stop();

    // Verify machine update was called
    expect(mockSupabase.from).toHaveBeenCalledWith('machines');
  });

  it('should emit stopped event on stop', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      command: 'echo',
      args: ['hello'],
      cwd: '/home/user',
    });

    const stoppedCallback = vi.fn();
    daemon.on('stopped', stoppedCallback);

    await daemon.start();
    await daemon.stop();

    expect(stoppedCallback).toHaveBeenCalled();
  });

  it('should report running status correctly', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      command: 'echo',
      args: ['hello'],
      cwd: '/home/user',
    });

    expect(daemon.isRunning()).toBe(false);

    await daemon.start();
    expect(daemon.isRunning()).toBe(true);

    await daemon.stop();
    expect(daemon.isRunning()).toBe(false);
  });

  it('should throw error when starting already running daemon', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      command: 'echo',
      args: ['hello'],
      cwd: '/home/user',
    });

    await daemon.start();

    await expect(daemon.start()).rejects.toThrow('Daemon is already running');
  });

  it('should allow write() to send input to PTY', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      command: 'cat',
      args: [],
      cwd: '/home/user',
    });

    await daemon.start();

    // Should not throw
    expect(() => daemon!.write('test input')).not.toThrow();
  });

  it('should allow resize() to change PTY dimensions', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      command: 'cat',
      args: [],
      cwd: '/home/user',
    });

    await daemon.start();

    // Should not throw
    expect(() => daemon!.resize(80, 24)).not.toThrow();
  });
});
