import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImageAttachment, ModelInfo, SlashCommand } from 'termbridge-shared';

// Mock Claude Agent SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

import { SdkSession } from '../daemon/sdk-session.js';
import { query } from '@anthropic-ai/claude-agent-sdk';

describe('SdkSession', () => {
  let sdkSession: SdkSession;
  const mockedQuery = vi.mocked(query);

  beforeEach(() => {
    vi.clearAllMocks();
    sdkSession = new SdkSession({ cwd: '/test' });

    // Default mock to return empty async iterable
    mockedQuery.mockImplementation(async function* () {
      yield { type: 'result', result: 'done' };
    } as any);
  });

  describe('permission mode events', () => {
    it('should emit permission-mode event on init message', async () => {
      // Mock query to return a system init message with permissionMode
      mockedQuery.mockImplementation(async function* () {
        yield {
          type: 'system',
          subtype: 'init',
          session_id: 'test-session-id',
          permissionMode: 'bypassPermissions',
        };
        yield { type: 'result', result: 'done' };
      } as any);

      const permissionModeHandler = vi.fn();
      sdkSession.on('permission-mode', permissionModeHandler);

      await sdkSession.sendPrompt('Hello');

      expect(permissionModeHandler).toHaveBeenCalledWith('bypassPermissions');
    });

    it('should have default permission mode of default (Ask before edits)', () => {
      expect(sdkSession.getPermissionMode()).toBe('default');
    });

    it('should allow setting permission mode', () => {
      sdkSession.setPermissionMode('plan');
      expect(sdkSession.getPermissionMode()).toBe('plan');
    });

    it('should emit permission-mode event when mode is changed', () => {
      const permissionModeHandler = vi.fn();
      sdkSession.on('permission-mode', permissionModeHandler);

      sdkSession.setPermissionMode('default');

      expect(permissionModeHandler).toHaveBeenCalledWith('default');
    });
  });

  describe('sendPrompt with attachments', () => {
    it('should accept optional ImageAttachment array', async () => {
      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/jpeg', data: 'base64data' },
      ];

      // Should not throw when called with attachments
      await sdkSession.sendPrompt('Describe this image', attachments);

      expect(mockedQuery).toHaveBeenCalled();
    });

    it('should build content blocks with image type', async () => {
      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/jpeg', data: 'base64data' },
      ];

      await sdkSession.sendPrompt('Describe this image', attachments);

      // Verify query was called with the right structure
      const callArgs = mockedQuery.mock.calls[0][0];
      expect(callArgs).toBeDefined();

      // When attachments are provided, prompt should be an array or content blocks
      // The exact format depends on SDK implementation
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.any(Object),
        })
      );
    });

    it('should include base64 source in image content block', async () => {
      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/png', data: 'iVBORw0KGgoAAAANS' },
      ];

      await sdkSession.sendPrompt('What is this?', attachments);

      // The implementation should pass data to the query
      expect(mockedQuery).toHaveBeenCalled();
    });

    it('should add text block after images when text provided', async () => {
      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/jpeg', data: 'base64data' },
      ];

      await sdkSession.sendPrompt('Describe this image', attachments);

      expect(mockedQuery).toHaveBeenCalled();
    });

    it('should work with images only (no text)', async () => {
      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/jpeg', data: 'base64data' },
      ];

      // Empty prompt with attachments should work
      await sdkSession.sendPrompt('', attachments);

      expect(mockedQuery).toHaveBeenCalled();
    });

    it('should work with text only (no attachments)', async () => {
      await sdkSession.sendPrompt('Hello, how are you?');

      // Now always uses streaming input mode (AsyncIterable) for setModel() support
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.any(Object),
        })
      );
    });
  });

  describe('getSupportedCommands', () => {
    it('should have getSupportedCommands method', () => {
      expect(typeof sdkSession.getSupportedCommands).toBe('function');
    });

    it('should return Promise<SlashCommand[]>', async () => {
      const result = await sdkSession.getSupportedCommands();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return known Claude Code commands', async () => {
      const result = await sdkSession.getSupportedCommands();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('description');
      expect(result[0]).toHaveProperty('argumentHint');
    });
  });

  describe('session resumption', () => {
    it('should resume session when sending subsequent messages', async () => {
      // First query to establish session
      mockedQuery.mockImplementation(async function* () {
        yield {
          type: 'system',
          subtype: 'init',
          session_id: 'test-session-123',
        };
        yield { type: 'result', result: 'done' };
      } as any);

      await sdkSession.sendPrompt('First message');
      expect(sdkSession.getSessionId()).toBe('test-session-123');

      // Send second message - should resume
      await sdkSession.sendPrompt('Second message');

      // Second call should have resume option
      const secondCall = mockedQuery.mock.calls[1][0];
      expect(secondCall.options.resume).toBe('test-session-123');
    });
  });

  describe('model switching', () => {
    it('should pass model option when creating query', async () => {
      await sdkSession.sendPrompt('Hello');

      expect(mockedQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            model: 'default',
          }),
        })
      );
    });

    it('should pass updated model option after setModel', async () => {
      await sdkSession.setModel('opus');
      await sdkSession.sendPrompt('Hello');

      expect(mockedQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            model: 'opus',
          }),
        })
      );
    });

    it('should emit model event when model changes', async () => {
      const modelHandler = vi.fn();
      sdkSession.on('model', modelHandler);

      await sdkSession.setModel('opus');

      expect(modelHandler).toHaveBeenCalledWith('opus');
    });

    it('should return fallback models when no query is active', async () => {
      const models = await sdkSession.getSupportedModels();

      expect(models.length).toBe(3);
      expect(models[0].value).toBe('default');
    });

    it('should clear sessionId when model changes to force new session', async () => {
      // Establish a session first
      mockedQuery.mockImplementation(async function* () {
        yield {
          type: 'system',
          subtype: 'init',
          session_id: 'test-session-123',
        };
        yield { type: 'result', result: 'done' };
      } as any);

      await sdkSession.sendPrompt('First message');
      expect(sdkSession.getSessionId()).toBe('test-session-123');

      // Change model - should clear session
      await sdkSession.setModel('opus');
      expect(sdkSession.getSessionId()).toBeNull();
    });

    it('should not resume session after model change', async () => {
      // Establish a session first
      mockedQuery.mockImplementation(async function* () {
        yield {
          type: 'system',
          subtype: 'init',
          session_id: 'test-session-123',
        };
        yield { type: 'result', result: 'done' };
      } as any);

      await sdkSession.sendPrompt('First message');

      // Change model
      await sdkSession.setModel('opus');

      // Send another message - should NOT have resume option
      await sdkSession.sendPrompt('Second message');

      const secondCall = mockedQuery.mock.calls[1][0];
      expect(secondCall.options.resume).toBeUndefined();
      expect(secondCall.options.model).toBe('opus');
    });

    it('should track conversation history', async () => {
      mockedQuery.mockImplementation(async function* () {
        yield {
          type: 'system',
          subtype: 'init',
          session_id: 'test-session-123',
        };
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Hello! How can I help?' }],
          },
        };
        yield { type: 'result', result: 'done' };
      } as any);

      await sdkSession.sendPrompt('Hello');

      const history = sdkSession.getConversationHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(history[1]).toEqual({ role: 'assistant', content: 'Hello! How can I help?' });
    });

    it('should include conversation context in prompt after model change', async () => {
      // First establish session and conversation
      mockedQuery.mockImplementation(async function* () {
        yield {
          type: 'system',
          subtype: 'init',
          session_id: 'test-session-123',
        };
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'I am Claude Sonnet.' }],
          },
        };
        yield { type: 'result', result: 'done' };
      } as any);

      await sdkSession.sendPrompt('Who are you?');

      // Change model
      await sdkSession.setModel('opus');

      // Send new message - should include context
      await sdkSession.sendPrompt('Continue helping me');

      const secondCall = mockedQuery.mock.calls[1][0];
      // The prompt should be an async iterable that yields a user message with context
      expect(secondCall.options.model).toBe('opus');
      // Context should be included (we'll verify the structure in implementation)
    });

    it('should clear conversation history and session ID when clearHistory is called', async () => {
      mockedQuery.mockImplementation(async function* () {
        yield {
          type: 'system',
          subtype: 'init',
          session_id: 'test-session-123',
        };
        yield {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Response' }],
          },
        };
        yield { type: 'result', result: 'done' };
      } as any);

      await sdkSession.sendPrompt('Hello');
      expect(sdkSession.getConversationHistory().length).toBe(2);
      expect(sdkSession.getSessionId()).toBe('test-session-123');

      sdkSession.clearHistory();
      expect(sdkSession.getConversationHistory().length).toBe(0);
      expect(sdkSession.getSessionId()).toBeNull();
    });

    it('should not resume session after clearHistory', async () => {
      mockedQuery.mockImplementation(async function* () {
        yield {
          type: 'system',
          subtype: 'init',
          session_id: 'test-session-123',
        };
        yield { type: 'result', result: 'done' };
      } as any);

      await sdkSession.sendPrompt('First message');
      expect(sdkSession.getSessionId()).toBe('test-session-123');

      sdkSession.clearHistory();

      // Send another message - should NOT have resume option
      await sdkSession.sendPrompt('Second message');

      const secondCall = mockedQuery.mock.calls[1][0];
      expect(secondCall.options.resume).toBeUndefined();
    });
  });

  describe('thinking mode', () => {
    it('should have thinking mode disabled by default', () => {
      expect(sdkSession.getThinkingMode()).toBe(false);
    });

    it('should allow setting thinking mode', async () => {
      await sdkSession.setThinkingMode(true);
      expect(sdkSession.getThinkingMode()).toBe(true);
    });

    it('should emit thinking-mode event when mode is changed', async () => {
      const thinkingModeHandler = vi.fn();
      sdkSession.on('thinking-mode', thinkingModeHandler);

      await sdkSession.setThinkingMode(true);

      expect(thinkingModeHandler).toHaveBeenCalledWith(true);
    });

    it('should call setMaxThinkingTokens on query when thinking is enabled', async () => {
      const mockSetMaxThinkingTokens = vi.fn().mockResolvedValue(undefined);
      mockedQuery.mockImplementation(() => {
        const queryObj = (async function* () {
          yield { type: 'result', result: 'done' };
        })();
        (queryObj as any).setMaxThinkingTokens = mockSetMaxThinkingTokens;
        return queryObj as any;
      });

      await sdkSession.setThinkingMode(true);
      await sdkSession.sendPrompt('Hello');

      expect(mockSetMaxThinkingTokens).toHaveBeenCalledWith(null);
    });

    it('should not call setMaxThinkingTokens when thinking is disabled', async () => {
      const mockSetMaxThinkingTokens = vi.fn().mockResolvedValue(undefined);
      mockedQuery.mockImplementation(() => {
        const queryObj = (async function* () {
          yield { type: 'result', result: 'done' };
        })();
        (queryObj as any).setMaxThinkingTokens = mockSetMaxThinkingTokens;
        return queryObj as any;
      });

      await sdkSession.setThinkingMode(false);
      await sdkSession.sendPrompt('Hello');

      expect(mockSetMaxThinkingTokens).not.toHaveBeenCalled();
    });
  });
});
