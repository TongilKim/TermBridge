import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock node-pty before importing PtyManager
const mockPtyProcess = {
  onData: vi.fn(),
  onExit: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
};

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => mockPtyProcess),
}));

// Import after mocking
import { PtyManager } from '../daemon/pty.js';
import * as pty from 'node-pty';

describe('PtyManager', () => {
  let ptyManager: PtyManager | null = null;
  let dataCallback: ((data: string) => void) | null = null;
  let exitCallback: ((exitInfo: { exitCode: number }) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    dataCallback = null;
    exitCallback = null;

    // Capture the callbacks when onData/onExit are called
    mockPtyProcess.onData.mockImplementation((cb: (data: string) => void) => {
      dataCallback = cb;
    });
    mockPtyProcess.onExit.mockImplementation(
      (cb: (exitInfo: { exitCode: number }) => void) => {
        exitCallback = cb;
      }
    );
  });

  afterEach(() => {
    if (ptyManager) {
      ptyManager.kill();
      ptyManager = null;
    }
  });

  it('should be instantiated', () => {
    ptyManager = new PtyManager();
    expect(ptyManager).toBeDefined();
    expect(ptyManager).toBeInstanceOf(PtyManager);
  });

  it('should start a process with spawn()', async () => {
    ptyManager = new PtyManager();

    await ptyManager.spawn('echo', ['hello'], process.cwd());

    expect(pty.spawn).toHaveBeenCalledWith('echo', ['hello'], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: process.cwd(),
      env: process.env,
    });
  });

  it('should emit output event when process writes to stdout', async () => {
    ptyManager = new PtyManager();

    const outputs: string[] = [];
    ptyManager.on('output', (data: string) => {
      outputs.push(data);
    });

    await ptyManager.spawn('echo', ['test output'], process.cwd());

    // Simulate PTY output
    if (dataCallback) {
      dataCallback('test output\r\n');
    }

    expect(outputs).toContain('test output\r\n');
  });

  it('should emit exit event when process exits', async () => {
    ptyManager = new PtyManager();

    let exitCode: number | undefined;
    ptyManager.on('exit', (code: number) => {
      exitCode = code;
    });

    await ptyManager.spawn('echo', ['done'], process.cwd());

    // Simulate process exit
    if (exitCallback) {
      exitCallback({ exitCode: 0 });
    }

    expect(exitCode).toBe(0);
  });

  it('should emit exit with correct exit code', async () => {
    ptyManager = new PtyManager();

    let exitCode: number | undefined;
    ptyManager.on('exit', (code: number) => {
      exitCode = code;
    });

    await ptyManager.spawn('false', [], process.cwd());

    // Simulate exit with code 1
    if (exitCallback) {
      exitCallback({ exitCode: 1 });
    }

    expect(exitCode).toBe(1);
  });

  it('should send data to the process with write()', async () => {
    ptyManager = new PtyManager();

    await ptyManager.spawn('cat', [], process.cwd());

    ptyManager.write('hello from test\n');

    expect(mockPtyProcess.write).toHaveBeenCalledWith('hello from test\n');
  });

  it('should terminate the process with kill()', async () => {
    ptyManager = new PtyManager();

    await ptyManager.spawn('sleep', ['10'], process.cwd());

    ptyManager.kill();

    expect(mockPtyProcess.kill).toHaveBeenCalled();
  });

  it('should return accumulated output with getBuffer()', async () => {
    ptyManager = new PtyManager();

    await ptyManager.spawn('echo', ['buffer test'], process.cwd());

    // Simulate PTY output
    if (dataCallback) {
      dataCallback('buffer test\r\n');
    }

    const buffer = ptyManager.getBuffer();
    expect(buffer).toContain('buffer test');
  });

  it('should change terminal dimensions with resize()', async () => {
    ptyManager = new PtyManager();

    await ptyManager.spawn('echo', ['resize test'], process.cwd());

    ptyManager.resize(80, 24);

    expect(mockPtyProcess.resize).toHaveBeenCalledWith(80, 24);

    ptyManager.resize(120, 40);

    expect(mockPtyProcess.resize).toHaveBeenCalledWith(120, 40);
  });

  it('should use xterm-256color as terminal type', async () => {
    ptyManager = new PtyManager();

    await ptyManager.spawn('sh', ['-c', 'echo $TERM'], process.cwd());

    expect(pty.spawn).toHaveBeenCalledWith(
      'sh',
      ['-c', 'echo $TERM'],
      expect.objectContaining({
        name: 'xterm-256color',
      })
    );
  });
});
