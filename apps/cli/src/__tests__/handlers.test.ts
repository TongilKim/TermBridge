import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageHandler } from '../realtime/handlers.js';
import type { RealtimeMessage } from 'termbridge-shared';

describe('MessageHandler', () => {
  let handler: MessageHandler;

  beforeEach(() => {
    handler = new MessageHandler();
  });

  it('should process output message correctly', () => {
    const callback = vi.fn();
    handler.registerHandler('output', callback);

    const message: RealtimeMessage = {
      type: 'output',
      content: 'test output',
      timestamp: Date.now(),
      seq: 1,
    };

    handler.handleMessage(message);

    expect(callback).toHaveBeenCalledWith(message);
  });

  it('should process input message correctly', () => {
    const callback = vi.fn();
    handler.registerHandler('input', callback);

    const message: RealtimeMessage = {
      type: 'input',
      content: 'test input',
      timestamp: Date.now(),
      seq: 2,
    };

    handler.handleMessage(message);

    expect(callback).toHaveBeenCalledWith(message);
  });

  it('should process ping message and respond with pong', () => {
    const pongCallback = vi.fn();
    handler.on('send-pong', pongCallback);

    const message: RealtimeMessage = {
      type: 'ping',
      timestamp: Date.now(),
      seq: 3,
    };

    handler.handleMessage(message);

    expect(pongCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'pong',
        seq: 3,
      })
    );
  });

  it('should process system message correctly', () => {
    const callback = vi.fn();
    handler.registerHandler('system', callback);

    const message: RealtimeMessage = {
      type: 'system',
      content: 'system notification',
      timestamp: Date.now(),
      seq: 4,
    };

    handler.handleMessage(message);

    expect(callback).toHaveBeenCalledWith(message);
  });

  it('should ignore unknown message types gracefully', () => {
    const callback = vi.fn();
    handler.registerHandler('output', callback);

    // Create a message with an unknown type (cast to bypass TypeScript)
    const message = {
      type: 'unknown' as any,
      content: 'unknown',
      timestamp: Date.now(),
      seq: 5,
    };

    // Should not throw
    expect(() => handler.handleMessage(message)).not.toThrow();
    expect(callback).not.toHaveBeenCalled();
  });

  it('should emit event for each message type', () => {
    const outputListener = vi.fn();
    const errorListener = vi.fn();

    handler.on('output', outputListener);
    handler.on('error', errorListener);

    const outputMsg: RealtimeMessage = {
      type: 'output',
      content: 'output data',
      timestamp: Date.now(),
      seq: 6,
    };

    const errorMsg: RealtimeMessage = {
      type: 'error',
      content: 'error data',
      timestamp: Date.now(),
      seq: 7,
    };

    handler.handleMessage(outputMsg);
    handler.handleMessage(errorMsg);

    expect(outputListener).toHaveBeenCalledWith(outputMsg);
    expect(errorListener).toHaveBeenCalledWith(errorMsg);
  });

  it('should allow multiple handlers for the same message type', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    handler.registerHandler('output', callback1);
    handler.registerHandler('output', callback2);

    const message: RealtimeMessage = {
      type: 'output',
      content: 'test',
      timestamp: Date.now(),
      seq: 8,
    };

    handler.handleMessage(message);

    expect(callback1).toHaveBeenCalledWith(message);
    expect(callback2).toHaveBeenCalledWith(message);
  });

  it('should remove specific handler', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    handler.registerHandler('output', callback1);
    handler.registerHandler('output', callback2);

    handler.removeHandler('output', callback1);

    const message: RealtimeMessage = {
      type: 'output',
      content: 'test',
      timestamp: Date.now(),
      seq: 9,
    };

    handler.handleMessage(message);

    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).toHaveBeenCalledWith(message);
  });

  it('should clear all handlers for a type', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    handler.registerHandler('output', callback1);
    handler.registerHandler('output', callback2);

    handler.clearHandlers('output');

    const message: RealtimeMessage = {
      type: 'output',
      content: 'test',
      timestamp: Date.now(),
      seq: 10,
    };

    handler.handleMessage(message);

    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).not.toHaveBeenCalled();
  });
});
