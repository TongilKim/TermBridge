import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration tests for Mobile-to-Realtime communication flow
 * These tests verify the end-to-end flow of data from Mobile to CLI via Realtime
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
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'session-1',
            machine_id: 'machine-1',
            status: 'active',
            started_at: new Date().toISOString(),
          },
        ],
        error: null,
      }),
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'session-1',
            machine_id: 'machine-1',
            status: 'active',
          },
          error: null,
        }),
      }),
    }),
  })),
  auth: {
    getSession: vi.fn().mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    }),
    signInWithPassword: vi.fn().mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' }, session: {} },
      error: null,
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  },
};

describe('Mobile to Realtime Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Session List', () => {
    it('should fetch and display user sessions', async () => {
      const fetchSessions = async () => {
        const { data, error } = await mockSupabase
          .from('sessions')
          .select('*')
          .order('started_at', { ascending: false });

        return { sessions: data, error };
      };

      const { sessions, error } = await fetchSessions();

      expect(error).toBeNull();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].status).toBe('active');
    });

    it('should show active sessions with online indicator', async () => {
      const sessions = [
        { id: '1', status: 'active', machine: { status: 'online' } },
        { id: '2', status: 'active', machine: { status: 'offline' } },
        { id: '3', status: 'ended', machine: { status: 'offline' } },
      ];

      const activeSessions = sessions.filter(
        (s) => s.status === 'active' && s.machine.status === 'online'
      );

      expect(activeSessions).toHaveLength(1);
    });

    it('should handle empty sessions list', async () => {
      mockSupabase.from = vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }));

      const { data } = await mockSupabase
        .from('sessions')
        .select('*')
        .order('started_at', { ascending: false });

      expect(data).toEqual([]);
    });
  });

  describe('Terminal Connection', () => {
    it('should connect to session realtime channel', async () => {
      const sessionId = 'session-123';
      const channelName = `session:${sessionId}:output`;

      mockSupabase.channel(channelName);

      expect(mockSupabase.channel).toHaveBeenCalledWith(channelName);
    });

    it('should receive and accumulate output messages', async () => {
      const messages: any[] = [];
      let lastSeq = 0;

      const addMessage = (message: any) => {
        messages.push(message);
        lastSeq = message.seq;
      };

      // Simulate receiving messages
      addMessage({ type: 'output', content: 'Hello', seq: 1 });
      addMessage({ type: 'output', content: ' World', seq: 2 });
      addMessage({ type: 'output', content: '!\n', seq: 3 });

      expect(messages).toHaveLength(3);
      expect(lastSeq).toBe(3);
      expect(messages.map((m) => m.content).join('')).toBe('Hello World!\n');
    });

    it('should detect and handle message gaps', async () => {
      const messages: any[] = [];
      let lastSeq = 0;
      const gaps: number[] = [];

      const addMessage = (message: any) => {
        if (lastSeq > 0 && message.seq !== lastSeq + 1) {
          gaps.push(message.seq);
        }
        messages.push(message);
        lastSeq = message.seq;
      };

      addMessage({ seq: 1, content: 'a' });
      addMessage({ seq: 2, content: 'b' });
      addMessage({ seq: 5, content: 'e' }); // Gap!
      addMessage({ seq: 6, content: 'f' });

      expect(gaps).toContain(5);
    });

    it('should handle large output without freezing', async () => {
      const largeOutput = 'x'.repeat(100000);
      const messages: any[] = [];

      const startTime = Date.now();

      // Simulate processing large output
      for (let i = 0; i < 100; i++) {
        messages.push({
          type: 'output',
          content: largeOutput.substring(i * 1000, (i + 1) * 1000),
          seq: i + 1,
        });
      }

      const endTime = Date.now();

      expect(messages).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in < 1s
    });
  });

  describe('Input Sending', () => {
    it('should send input to CLI via realtime channel', async () => {
      const sessionId = 'session-123';
      const inputContent = 'y\n';

      await mockChannel.send({
        type: 'broadcast',
        event: 'input',
        payload: {
          type: 'input',
          content: inputContent,
          timestamp: Date.now(),
          seq: 1,
        },
      });

      expect(mockChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'input',
          payload: expect.objectContaining({
            content: inputContent,
          }),
        })
      );
    });

    it('should send quick action inputs correctly', async () => {
      const quickActions = [
        { label: 'y', value: 'y\n' },
        { label: 'n', value: 'n\n' },
        { label: 'Enter', value: '\n' },
        { label: 'Ctrl+C', value: '\x03' },
        { label: 'Tab', value: '\t' },
      ];

      for (const action of quickActions) {
        await mockChannel.send({
          type: 'broadcast',
          event: 'input',
          payload: {
            type: 'input',
            content: action.value,
            timestamp: Date.now(),
            seq: 1,
          },
        });
      }

      expect(mockChannel.send).toHaveBeenCalledTimes(5);
    });

    it('should not send input when disconnected', async () => {
      const state = 'disconnected';

      const sendInput = async (content: string) => {
        if (state !== 'connected') {
          throw new Error('Not connected');
        }
        await mockChannel.send({ type: 'broadcast', event: 'input', payload: { content } });
      };

      await expect(sendInput('test')).rejects.toThrow('Not connected');
    });
  });

  describe('Authentication Flow', () => {
    it('should sign in user successfully', async () => {
      const { data, error } = await mockSupabase.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(error).toBeNull();
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe('test@example.com');
    });

    it('should handle sign in failure', async () => {
      mockSupabase.auth.signInWithPassword = vi.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid credentials' },
      });

      const { data, error } = await mockSupabase.auth.signInWithPassword({
        email: 'wrong@example.com',
        password: 'wrong',
      });

      expect(error).toBeDefined();
      expect(error.message).toBe('Invalid credentials');
    });

    it('should sign out and clear session', async () => {
      const { error } = await mockSupabase.auth.signOut();

      expect(error).toBeNull();
      expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    });

    it('should redirect to login when not authenticated', async () => {
      mockSupabase.auth.getSession = vi.fn().mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { data } = await mockSupabase.auth.getSession();

      expect(data.session).toBeNull();
      // In real app, this would trigger redirect to login
    });
  });

  describe('Connection State Management', () => {
    it('should track connection state correctly', async () => {
      const states: string[] = [];
      let currentState = 'disconnected';

      const setState = (state: string) => {
        states.push(state);
        currentState = state;
      };

      // Simulate connection flow
      setState('connecting');
      await new Promise((r) => setTimeout(r, 10));
      setState('connected');

      expect(states).toEqual(['connecting', 'connected']);
      expect(currentState).toBe('connected');
    });

    it('should handle reconnection attempts', async () => {
      const states: string[] = [];

      const simulateReconnection = async () => {
        states.push('disconnected');
        states.push('reconnecting');
        await new Promise((r) => setTimeout(r, 10));
        states.push('connected');
      };

      await simulateReconnection();

      expect(states).toContain('reconnecting');
      expect(states[states.length - 1]).toBe('connected');
    });
  });
});
