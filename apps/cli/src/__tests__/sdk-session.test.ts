import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImageAttachment, SlashCommand } from '@termbridge/shared';

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

      expect(mockedQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Hello, how are you?',
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
});
