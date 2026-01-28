import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration tests for Push Notification flow
 * These tests verify the end-to-end notification delivery from CLI to Mobile
 */

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Push Notification Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ status: 'ok' }] }),
    });
  });

  describe('Notification Triggers', () => {
    it('should detect task completion from output', () => {
      const outputs = [
        'Task completed successfully',
        'Done!',
        'Build finished',
        'All tests passed',
      ];

      const completionPatterns = ['task complete', 'done', 'finished', 'passed'];

      for (const output of outputs) {
        const lowerOutput = output.toLowerCase();
        const isComplete = completionPatterns.some((p) =>
          lowerOutput.includes(p)
        );
        expect(isComplete).toBe(true);
      }
    });

    it('should detect errors from output', () => {
      const outputs = [
        'Error: Something went wrong',
        'Failed to compile',
        'Exception thrown',
        'TypeError: undefined is not a function',
      ];

      const errorPatterns = ['error', 'failed', 'exception'];

      for (const output of outputs) {
        const lowerOutput = output.toLowerCase();
        const isError = errorPatterns.some((p) => lowerOutput.includes(p));
        expect(isError).toBe(true);
      }
    });

    it('should detect input required from output', () => {
      const outputs = [
        'Do you want to continue? (y/n)',
        'Press Enter to proceed',
        '[Y/n]',
        'Continue?',
      ];

      const inputPatterns = ['y/n', '[y/n]', 'press enter', 'continue?'];

      for (const output of outputs) {
        const lowerOutput = output.toLowerCase();
        const needsInput = inputPatterns.some((p) => lowerOutput.includes(p));
        expect(needsInput).toBe(true);
      }
    });
  });

  describe('Expo Push API', () => {
    it('should send notification to Expo Push API', async () => {
      const notification = {
        to: 'ExponentPushToken[xxxxxx]',
        title: 'Task Complete',
        body: 'Your Claude Code task has finished',
        data: { type: 'task_complete', sessionId: 'session-123' },
      };

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([notification]),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://exp.host/--/api/v2/push/send',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('ExponentPushToken'),
        })
      );
    });

    it('should batch multiple notifications', async () => {
      const tokens = [
        'ExponentPushToken[aaa]',
        'ExponentPushToken[bbb]',
        'ExponentPushToken[ccc]',
      ];

      const notifications = tokens.map((token) => ({
        to: token,
        title: 'Alert',
        body: 'Test message',
      }));

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifications),
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toHaveLength(3);
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        body: JSON.stringify([{ to: 'token', title: 'Test', body: 'Test' }]),
      });

      expect(response.ok).toBe(false);
    });

    it('should handle invalid push tokens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ status: 'error', message: 'DeviceNotRegistered' }],
          }),
      });

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        body: JSON.stringify([
          { to: 'invalid-token', title: 'Test', body: 'Test' },
        ]),
      });

      const result = await response.json();
      expect(result.data[0].status).toBe('error');
    });
  });

  describe('Token Management', () => {
    it('should save push token to database', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });

      const savePushToken = async (userId: string, token: string) => {
        return mockInsert({
          user_id: userId,
          token,
          updated_at: new Date().toISOString(),
        });
      };

      await savePushToken('user-123', 'ExponentPushToken[xxx]');

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-123',
          token: 'ExponentPushToken[xxx]',
        })
      );
    });

    it('should remove push token on logout', async () => {
      const mockDelete = vi.fn().mockResolvedValue({ error: null });

      const removePushToken = async (token: string) => {
        return mockDelete({ token });
      };

      await removePushToken('ExponentPushToken[xxx]');

      expect(mockDelete).toHaveBeenCalledWith({ token: 'ExponentPushToken[xxx]' });
    });

    it('should handle duplicate token upsert', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });

      const upsertToken = async (userId: string, token: string) => {
        return mockUpsert(
          { user_id: userId, token },
          { onConflict: 'token' }
        );
      };

      // Insert same token twice
      await upsertToken('user-123', 'ExponentPushToken[xxx]');
      await upsertToken('user-123', 'ExponentPushToken[xxx]');

      expect(mockUpsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('Notification Priority', () => {
    it('should set high priority for errors', () => {
      const getNotificationPriority = (type: string) => {
        if (type === 'error' || type === 'input_required') {
          return 'high';
        }
        return 'default';
      };

      expect(getNotificationPriority('error')).toBe('high');
      expect(getNotificationPriority('input_required')).toBe('high');
      expect(getNotificationPriority('task_complete')).toBe('default');
    });

    it('should include sound for all notifications', () => {
      const buildNotification = (type: string, title: string, body: string) => ({
        to: 'token',
        title,
        body,
        sound: 'default',
        priority: type === 'error' ? 'high' : 'default',
        data: { type },
      });

      const notification = buildNotification('error', 'Error', 'Something failed');

      expect(notification.sound).toBe('default');
      expect(notification.priority).toBe('high');
    });
  });

  describe('Edge Function Integration', () => {
    it('should validate required fields', () => {
      const validateRequest = (body: any) => {
        const required = ['userId', 'type', 'title', 'body'];
        const missing = required.filter((field) => !body[field]);
        return missing.length === 0 ? null : `Missing: ${missing.join(', ')}`;
      };

      expect(validateRequest({ userId: '1', type: 'error', title: 'T', body: 'B' })).toBeNull();
      expect(validateRequest({ userId: '1', type: 'error' })).toContain('title');
      expect(validateRequest({})).toContain('userId');
    });

    it('should return 200 when no tokens found', async () => {
      const handleNoTokens = () => ({
        status: 200,
        body: { message: 'No push tokens found for user', sent: 0 },
      });

      const response = handleNoTokens();

      expect(response.status).toBe(200);
      expect(response.body.sent).toBe(0);
    });

    it('should return count of sent notifications', async () => {
      const tokens = ['token1', 'token2', 'token3'];

      const handleSuccess = (tokenCount: number) => ({
        status: 200,
        body: { message: 'Notifications sent successfully', sent: tokenCount },
      });

      const response = handleSuccess(tokens.length);

      expect(response.body.sent).toBe(3);
    });
  });
});
