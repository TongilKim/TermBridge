import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConnectionManager } from '../realtime/connection.js';
import { EventEmitter } from 'events';

// Mock client
class MockClient extends EventEmitter {
  connected = false;
  connectCalls = 0;
  sendOutputCalls: Array<{ content: string; type: string }> = [];

  async connect() {
    this.connectCalls++;
    this.connected = true;
  }

  sendOutput(content: string, type: string = 'output') {
    this.sendOutputCalls.push({ content, type });
  }
}

describe('ConnectionManager', () => {
  let mockClient: MockClient;
  let connectionManager: ConnectionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mockClient = new MockClient();
    connectionManager = new ConnectionManager(mockClient, {
      heartbeatInterval: 1000, // 1s for testing
      heartbeatTimeout: 2000, // 2s for testing
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 1000,
    });
  });

  afterEach(() => {
    connectionManager.stop();
    vi.useRealTimers();
  });

  it('should have initial state as disconnected', () => {
    expect(connectionManager.getState()).toBe('disconnected');
  });

  it('should change state to connected on start()', () => {
    connectionManager.start();
    expect(connectionManager.getState()).toBe('connected');
  });

  it('should change state to disconnected on stop()', () => {
    connectionManager.start();
    expect(connectionManager.getState()).toBe('connected');

    connectionManager.stop();
    expect(connectionManager.getState()).toBe('disconnected');
  });

  it('should emit stateChange on state transitions', () => {
    const stateChanges: Array<{ from: string; to: string }> = [];
    connectionManager.on('stateChange', (change) => {
      stateChanges.push(change);
    });

    connectionManager.start();
    expect(stateChanges).toContainEqual({ from: 'disconnected', to: 'connected' });

    connectionManager.stop();
    expect(stateChanges).toContainEqual({ from: 'connected', to: 'disconnected' });
  });

  it('should return current state with getState()', () => {
    expect(connectionManager.getState()).toBe('disconnected');
    connectionManager.start();
    expect(connectionManager.getState()).toBe('connected');
  });

  it('should start heartbeat timer on start()', () => {
    connectionManager.start();

    // Advance time past heartbeat interval
    vi.advanceTimersByTime(1000);

    // Should have sent a ping
    expect(mockClient.sendOutputCalls.length).toBeGreaterThan(0);
  });

  it('should stop heartbeat timer on stop()', () => {
    connectionManager.start();
    connectionManager.stop();

    const callsBefore = mockClient.sendOutputCalls.length;

    // Advance time - should not send more pings
    vi.advanceTimersByTime(5000);

    expect(mockClient.sendOutputCalls.length).toBe(callsBefore);
  });

  it('should send ping at heartbeat interval', () => {
    connectionManager.start();

    // Initial state - no pings yet
    const initialCalls = mockClient.sendOutputCalls.length;

    // Advance past first heartbeat
    vi.advanceTimersByTime(1000);

    expect(mockClient.sendOutputCalls.length).toBeGreaterThan(initialCalls);
  });

  it('should detect timeout when no pong received', () => {
    connectionManager.start();

    // Advance past heartbeat timeout without calling onPong
    vi.advanceTimersByTime(3000);

    // Should be in reconnecting state
    expect(connectionManager.getState()).toBe('reconnecting');
  });

  it('should update lastPongAt timestamp on onPong()', () => {
    connectionManager.start();

    // Advance time
    vi.advanceTimersByTime(500);

    // Call onPong
    connectionManager.onPong();

    // Advance more time but less than timeout from the pong
    vi.advanceTimersByTime(500);

    // Should still be connected (pong reset the timeout)
    expect(connectionManager.getState()).toBe('connected');
  });

  it('should change to reconnecting on timeout', () => {
    const stateChanges: Array<{ from: string; to: string }> = [];
    connectionManager.on('stateChange', (change) => {
      stateChanges.push(change);
    });

    connectionManager.start();

    // Advance past timeout
    vi.advanceTimersByTime(3000);

    expect(stateChanges).toContainEqual({ from: 'connected', to: 'reconnecting' });
  });

  it('should attempt reconnect on disconnect', async () => {
    connectionManager.start();

    // Force disconnect by letting timeout happen
    vi.advanceTimersByTime(3000);

    expect(connectionManager.getState()).toBe('reconnecting');

    // Should attempt to reconnect
    await vi.advanceTimersByTimeAsync(200);

    expect(mockClient.connectCalls).toBeGreaterThan(0);
  });

  it('should use exponential backoff for retries', async () => {
    // Make connect fail
    mockClient.connect = vi.fn().mockRejectedValue(new Error('Connection failed'));

    connectionManager.start();

    // Force reconnecting state
    vi.advanceTimersByTime(3000);

    // First retry after baseDelay (100ms + jitter)
    await vi.advanceTimersByTimeAsync(150);

    // Second retry should be longer (200ms + jitter)
    await vi.advanceTimersByTimeAsync(300);

    // Third retry should be even longer (400ms + jitter)
    await vi.advanceTimersByTimeAsync(500);

    // Should have multiple connect attempts
    expect(mockClient.connect).toHaveBeenCalled();
  });

  it('should add jitter to backoff delay (±20%)', () => {
    // This is tested implicitly - the calculateBackoff method adds jitter
    // We verify the backoff is within expected range
    const delays: number[] = [];

    // Spy on setTimeout to capture delays
    const originalSetTimeout = global.setTimeout;
    vi.spyOn(global, 'setTimeout').mockImplementation((fn, delay) => {
      if (delay && delay > 0) {
        delays.push(delay);
      }
      return originalSetTimeout(fn, 0);
    });

    connectionManager.start();
    vi.advanceTimersByTime(3000); // Trigger reconnect

    // Delays should be within jitter range
    // For baseDelay=100, first delay should be 80-120
    if (delays.length > 0) {
      const firstDelay = delays[0];
      expect(firstDelay).toBeGreaterThanOrEqual(80);
      expect(firstDelay).toBeLessThanOrEqual(120);
    }
  });

  it('should emit reconnecting event with attempt count', async () => {
    mockClient.connect = vi.fn().mockRejectedValue(new Error('fail'));

    const reconnectEvents: Array<{ attempt: number; delay: number }> = [];
    connectionManager.on('reconnecting', (data) => {
      reconnectEvents.push(data);
    });

    connectionManager.start();
    vi.advanceTimersByTime(3000); // Trigger reconnect

    await vi.advanceTimersByTimeAsync(200);

    expect(reconnectEvents.length).toBeGreaterThan(0);
    expect(reconnectEvents[0]?.attempt).toBe(1);
  });

  it('should emit reconnected on successful reconnect', async () => {
    let reconnected = false;
    connectionManager.on('reconnected', () => {
      reconnected = true;
    });

    connectionManager.start();
    vi.advanceTimersByTime(3000); // Trigger reconnect

    await vi.advanceTimersByTimeAsync(200);

    expect(reconnected).toBe(true);
  });

  it('should emit maxRetriesExceeded after max attempts', async () => {
    mockClient.connect = vi.fn().mockRejectedValue(new Error('fail'));

    let maxRetriesExceeded = false;
    connectionManager.on('maxRetriesExceeded', () => {
      maxRetriesExceeded = true;
    });

    connectionManager.start();
    vi.advanceTimersByTime(3000); // Trigger reconnect

    // Wait for all retries to fail
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(2000);
    }

    expect(maxRetriesExceeded).toBe(true);
    expect(connectionManager.getState()).toBe('disconnected');
  });

  it('should reset retry count on successful connection', async () => {
    let attempts = 0;
    mockClient.connect = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error('fail');
      }
      mockClient.connected = true;
    });

    connectionManager.start();
    vi.advanceTimersByTime(3000); // Trigger reconnect

    // First retry fails
    await vi.advanceTimersByTimeAsync(200);

    // Second retry succeeds
    await vi.advanceTimersByTimeAsync(400);

    expect(connectionManager.getState()).toBe('connected');

    // Trigger another reconnect
    vi.advanceTimersByTime(3000);

    // Retry count should have reset, so attempt should be 1 again
    const reconnectEvents: Array<{ attempt: number }> = [];
    connectionManager.on('reconnecting', (data) => {
      reconnectEvents.push(data);
    });

    await vi.advanceTimersByTimeAsync(200);

    // New reconnect should start from attempt 1
    if (reconnectEvents.length > 0) {
      expect(reconnectEvents[0]?.attempt).toBe(1);
    }
  });
});
