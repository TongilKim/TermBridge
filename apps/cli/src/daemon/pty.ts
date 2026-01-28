import * as pty from 'node-pty';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export class PtyManager extends EventEmitter {
  private ptyProcess: pty.IPty | null = null;
  private childProcess: ChildProcess | null = null;
  private buffer: string = '';
  private useFallback: boolean = false;

  async spawn(command: string, args: string[], cwd: string): Promise<void> {
    // Try node-pty first
    try {
      this.ptyProcess = pty.spawn(command, args, {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd,
        env: process.env as Record<string, string>,
      });

      this.ptyProcess.onData((data) => {
        this.buffer += data;
        this.emit('output', data);
      });

      this.ptyProcess.onExit(({ exitCode }) => {
        this.emit('exit', exitCode);
      });
    } catch (error) {
      // Fall back to child_process if node-pty fails
      console.warn(
        '[WARN] node-pty failed, falling back to child_process. Interactive features may be limited.'
      );
      this.useFallback = true;

      this.childProcess = spawn(command, args, {
        cwd,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });

      this.childProcess.stdout?.on('data', (data) => {
        const str = data.toString();
        this.buffer += str;
        this.emit('output', str);
      });

      this.childProcess.stderr?.on('data', (data) => {
        const str = data.toString();
        this.buffer += str;
        this.emit('output', str);
      });

      this.childProcess.on('exit', (code) => {
        this.emit('exit', code ?? 0);
      });

      this.childProcess.on('error', (err) => {
        this.emit('output', `Error: ${err.message}\n`);
        this.emit('exit', 1);
      });
    }
  }

  write(data: string): void {
    if (this.ptyProcess) {
      this.ptyProcess.write(data);
    } else if (this.childProcess?.stdin) {
      this.childProcess.stdin.write(data);
    }
  }

  resize(cols: number, rows: number): void {
    if (this.ptyProcess) {
      this.ptyProcess.resize(cols, rows);
    }
    // child_process doesn't support resize
  }

  kill(): void {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
    if (this.childProcess) {
      this.childProcess.kill();
      this.childProcess = null;
    }
  }

  getBuffer(): string {
    return this.buffer;
  }

  clearBuffer(): void {
    this.buffer = '';
  }

  isUsingFallback(): boolean {
    return this.useFallback;
  }
}
