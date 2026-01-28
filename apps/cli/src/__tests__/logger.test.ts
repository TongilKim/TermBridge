import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Logger', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    };
    delete process.env.DEBUG;
    delete process.env.SILENT;
    vi.resetModules();
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.error.mockRestore();
    consoleSpy.warn.mockRestore();
  });

  it('should output info level messages', async () => {
    const { Logger } = await import('../utils/logger.js');
    const logger = new Logger();

    logger.info('Test info message');

    expect(consoleSpy.log).toHaveBeenCalled();
    const output = consoleSpy.log.mock.calls[0]?.[0] as string;
    expect(output).toContain('Test info message');
  });

  it('should output error level messages', async () => {
    const { Logger } = await import('../utils/logger.js');
    const logger = new Logger();

    logger.error('Test error message');

    expect(consoleSpy.error).toHaveBeenCalled();
    const output = consoleSpy.error.mock.calls[0]?.[0] as string;
    expect(output).toContain('Test error message');
  });

  it('should output warn level messages', async () => {
    const { Logger } = await import('../utils/logger.js');
    const logger = new Logger();

    logger.warn('Test warn message');

    expect(consoleSpy.warn).toHaveBeenCalled();
    const output = consoleSpy.warn.mock.calls[0]?.[0] as string;
    expect(output).toContain('Test warn message');
  });

  it('should output debug level messages when DEBUG=true', async () => {
    process.env.DEBUG = 'true';

    const { Logger } = await import('../utils/logger.js');
    const logger = new Logger();

    logger.debug('Test debug message');

    expect(consoleSpy.log).toHaveBeenCalled();
    const output = consoleSpy.log.mock.calls[0]?.[0] as string;
    expect(output).toContain('Test debug message');
  });

  it('should NOT output debug level messages when DEBUG is not set', async () => {
    // DEBUG not set
    const { Logger } = await import('../utils/logger.js');
    const logger = new Logger();

    logger.debug('Test debug message');

    expect(consoleSpy.log).not.toHaveBeenCalled();
  });

  it('should include timestamp in output', async () => {
    const { Logger } = await import('../utils/logger.js');
    const logger = new Logger();

    logger.info('Test message');

    const output = consoleSpy.log.mock.calls[0]?.[0] as string;
    // Check for ISO timestamp pattern or time pattern
    expect(output).toMatch(/\d{2}:\d{2}:\d{2}|\d{4}-\d{2}-\d{2}/);
  });

  it('should include log level in output', async () => {
    const { Logger } = await import('../utils/logger.js');
    const logger = new Logger();

    logger.info('Test message');

    const output = consoleSpy.log.mock.calls[0]?.[0] as string;
    expect(output.toLowerCase()).toContain('info');
  });

  it('should be silenced in test mode (SILENT=true)', async () => {
    process.env.SILENT = 'true';

    const { Logger } = await import('../utils/logger.js');
    const logger = new Logger();

    logger.info('Should not appear');
    logger.error('Should not appear');
    logger.warn('Should not appear');

    expect(consoleSpy.log).not.toHaveBeenCalled();
    expect(consoleSpy.error).not.toHaveBeenCalled();
    expect(consoleSpy.warn).not.toHaveBeenCalled();
  });
});
