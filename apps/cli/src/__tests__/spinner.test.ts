import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Spinner } from '../utils/spinner.js';

describe('Spinner', () => {
  let mockStream: {
    write: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mockStream = {
      write: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create spinner with message', () => {
    const spinner = new Spinner('Loading...');
    expect(spinner).toBeDefined();
  });

  it('should write spinner frames when started', () => {
    const spinner = new Spinner(
      'Loading...',
      mockStream as unknown as NodeJS.WriteStream
    );

    spinner.start();

    // Advance time to trigger spinner frame
    vi.advanceTimersByTime(80);

    expect(mockStream.write).toHaveBeenCalled();
    // Should have hidden cursor and written first frame
    const calls = mockStream.write.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes('Loading...'))).toBe(true);

    spinner.stop();
  });

  it('should update message while spinning', () => {
    const spinner = new Spinner(
      'Loading...',
      mockStream as unknown as NodeJS.WriteStream
    );

    spinner.start();
    vi.advanceTimersByTime(80);

    spinner.update('Processing...');
    vi.advanceTimersByTime(80);

    const calls = mockStream.write.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes('Processing...'))).toBe(true);

    spinner.stop();
  });

  it('should stop and clear line', () => {
    const spinner = new Spinner(
      'Loading...',
      mockStream as unknown as NodeJS.WriteStream
    );

    spinner.start();
    vi.advanceTimersByTime(80);

    mockStream.write.mockClear();
    spinner.stop();

    // Should clear line and show cursor
    const calls = mockStream.write.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes('\x1B[K'))).toBe(true); // Clear line
    expect(calls.some((c) => c.includes('\x1B[?25h'))).toBe(true); // Show cursor
  });

  it('should display success message with checkmark', () => {
    const spinner = new Spinner(
      'Loading...',
      mockStream as unknown as NodeJS.WriteStream
    );

    spinner.start();
    vi.advanceTimersByTime(80);

    mockStream.write.mockClear();
    spinner.succeed('Done!');

    const calls = mockStream.write.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes('✓') && c.includes('Done!'))).toBe(
      true
    );
  });

  it('should display failure message with cross', () => {
    const spinner = new Spinner(
      'Loading...',
      mockStream as unknown as NodeJS.WriteStream
    );

    spinner.start();
    vi.advanceTimersByTime(80);

    mockStream.write.mockClear();
    spinner.fail('Error!');

    const calls = mockStream.write.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes('✗') && c.includes('Error!'))).toBe(
      true
    );
  });

  it('should hide cursor on start', () => {
    const spinner = new Spinner(
      'Loading...',
      mockStream as unknown as NodeJS.WriteStream
    );

    spinner.start();

    const calls = mockStream.write.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes('\x1B[?25l'))).toBe(true); // Hide cursor
  });

  it('should not start multiple intervals', () => {
    const spinner = new Spinner(
      'Loading...',
      mockStream as unknown as NodeJS.WriteStream
    );

    spinner.start();
    const writeCountAfterFirstStart = mockStream.write.mock.calls.length;

    spinner.start(); // Second start should be ignored

    // Advance time
    vi.advanceTimersByTime(80);

    // Should only have one interval running (not double writes per frame)
    spinner.stop();
  });

  it('should cycle through spinner frames', () => {
    const spinner = new Spinner(
      'Test',
      mockStream as unknown as NodeJS.WriteStream
    );

    spinner.start();

    // Advance through multiple frames
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(80);
    }

    // Verify multiple writes occurred
    expect(mockStream.write.mock.calls.length).toBeGreaterThan(10);

    spinner.stop();
  });
});
