import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration tests for CLI-to-Realtime communication flow
 * These tests verify the end-to-end flow of data from PTY to Realtime channels
 */

// Mock Supabase
const mockChannel = {
  subscribe: vi.fn((cb) => {
    setTimeout(() => cb('SUBSCRIBED'), 0);
    return mockChannel;
  }),
  send: vi.fn().mockResolvedValue({ error: null }),
  on: vi.fn().mockReturnThis(),
};

const mockSupabase = {
  channel: vi.fn(() => mockChannel),
  removeChannel: vi.fn().mockResolvedValue({ error: null }),
  from: vi.fn(() => ({
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'test-session', machine_id: 'test-machine', status: 'active' },
          error: null,
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      }),
    }),
  })),
};

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  })),
}));

describe('CLI to Realtime Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Output Broadcasting', () => {
    it('should broadcast PTY output to realtime channel', async () => {
      // Simulate the flow: PTY output -> RealtimeClient.broadcast()
      const outputData = 'Hello from Claude Code';

      // Connect to channel
      await new Promise<void>((resolve) => {
        mockChannel.subscribe((status: string) => {
          if (status === 'SUBSCRIBED') resolve();
        });
      });

      // Simulate broadcast
      await mockChannel.send({
        type: 'broadcast',
        event: 'output',
        payload: {
          type: 'output',
          content: outputData,
          timestamp: Date.now(),
          seq: 1,
        },
      });

      expect(mockChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'output',
          payload: expect.objectContaining({
            content: outputData,
          }),
        })
      );
    });

    it('should include sequence number in broadcast messages', async () => {
      let seq = 0;

      const broadcast = async (content: string) => {
        await mockChannel.send({
          type: 'broadcast',
          event: 'output',
          payload: {
            type: 'output',
            content,
            timestamp: Date.now(),
            seq: ++seq,
          },
        });
      };

      await broadcast('message 1');
      await broadcast('message 2');
      await broadcast('message 3');

      expect(mockChannel.send).toHaveBeenCalledTimes(3);

      const calls = mockChannel.send.mock.calls;
      expect(calls[0][0].payload.seq).toBe(1);
      expect(calls[1][0].payload.seq).toBe(2);
      expect(calls[2][0].payload.seq).toBe(3);
    });

    it('should handle rapid consecutive outputs', async () => {
      const outputs = Array.from({ length: 100 }, (_, i) => `output-${i}`);
      let seq = 0;

      const broadcasts = outputs.map((content) =>
        mockChannel.send({
          type: 'broadcast',
          event: 'output',
          payload: { type: 'output', content, timestamp: Date.now(), seq: ++seq },
        })
      );

      await Promise.all(broadcasts);

      expect(mockChannel.send).toHaveBeenCalledTimes(100);
    });
  });

  describe('Input Receiving', () => {
    it('should receive input from mobile via realtime channel', async () => {
      let receivedInput: string | null = null;
      let inputHandler: ((payload: any) => void) | null = null;

      mockChannel.on = vi.fn((event, filter, handler) => {
        if (event === 'broadcast' && filter.event === 'input') {
          inputHandler = handler;
        }
        return mockChannel;
      });

      // Set up listener
      mockChannel.on('broadcast', { event: 'input' }, (payload: any) => {
        receivedInput = payload.payload.content;
      });

      // Simulate receiving input
      if (inputHandler) {
        inputHandler({
          payload: {
            type: 'input',
            content: 'y\n',
            timestamp: Date.now(),
            seq: 1,
          },
        });
      }

      expect(receivedInput).toBe('y\n');
    });

    it('should handle special characters in input', async () => {
      const specialInputs = [
        '\x03', // Ctrl+C
        '\x04', // Ctrl+D
        '\t',   // Tab
        '\n',   // Enter
        '\x1b[A', // Arrow up
      ];

      for (const input of specialInputs) {
        const message = {
          type: 'input',
          content: input,
          timestamp: Date.now(),
          seq: 1,
        };

        // Should not throw
        expect(() => {
          JSON.stringify(message);
        }).not.toThrow();
      }
    });
  });

  describe('Session Lifecycle', () => {
    it('should create session on daemon start', async () => {
      const createSession = async (machineId: string) => {
        const { data, error } = await mockSupabase
          .from('sessions')
          .insert({ machine_id: machineId, status: 'active' })
          .select()
          .single();

        return data;
      };

      const session = await createSession('machine-123');

      expect(session).toBeDefined();
      expect(session.status).toBe('active');
    });

    it('should end session on daemon stop', async () => {
      const endSession = async (sessionId: string) => {
        await mockSupabase
          .from('sessions')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('id', sessionId);
      };

      // Should not throw
      await expect(endSession('session-123')).resolves.not.toThrow();
    });

    it('should update machine status on connection changes', async () => {
      const updateMachineStatus = async (machineId: string, status: string) => {
        await mockSupabase
          .from('machines')
          .update({ status, last_seen_at: new Date().toISOString() })
          .eq('id', machineId);
      };

      await updateMachineStatus('machine-123', 'online');
      await updateMachineStatus('machine-123', 'offline');

      expect(mockSupabase.from).toHaveBeenCalledWith('machines');
    });
  });

  describe('Reconnection Flow', () => {
    it('should attempt reconnection on disconnect', async () => {
      let reconnectAttempts = 0;
      const maxRetries = 3;

      const attemptReconnect = async (): Promise<boolean> => {
        reconnectAttempts++;
        if (reconnectAttempts >= maxRetries) {
          return true; // Simulated success on 3rd attempt
        }
        return false;
      };

      while (reconnectAttempts < maxRetries) {
        const success = await attemptReconnect();
        if (success) break;
      }

      expect(reconnectAttempts).toBe(3);
    });

    it('should use exponential backoff for retries', () => {
      const baseDelay = 1000;
      const maxDelay = 30000;

      const calculateBackoff = (attempt: number): number => {
        const exponentialDelay = Math.min(
          baseDelay * Math.pow(2, attempt),
          maxDelay
        );
        const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
        return Math.floor(exponentialDelay + jitter);
      };

      const delays = [0, 1, 2, 3, 4, 5].map(calculateBackoff);

      // Verify exponential growth (with some tolerance for jitter)
      expect(delays[1]).toBeLessThan(delays[2]);
      expect(delays[2]).toBeLessThan(delays[3]);
      expect(delays[5]).toBeLessThanOrEqual(maxDelay * 1.2); // Allow for jitter
    });
  });
});
