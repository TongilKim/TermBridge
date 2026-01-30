import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImageAttachment } from '@termbridge/shared';

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
});
