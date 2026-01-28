export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentFrame = 0;
  private interval: NodeJS.Timeout | null = null;
  private message: string;
  private stream: NodeJS.WriteStream;

  constructor(message: string, stream: NodeJS.WriteStream = process.stdout) {
    this.message = message;
    this.stream = stream;
  }

  start(): void {
    if (this.interval) {
      return;
    }

    // Hide cursor
    this.stream.write('\x1B[?25l');

    this.interval = setInterval(() => {
      const frame = this.frames[this.currentFrame];
      this.stream.write(`\r${frame} ${this.message}`);
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    }, 80);
  }

  update(message: string): void {
    this.message = message;
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    // Clear the line and show cursor
    this.stream.write('\r\x1B[K');
    this.stream.write('\x1B[?25h');
  }

  succeed(message: string): void {
    this.stop();
    this.stream.write(`\r✓ ${message}\n`);
  }

  fail(message: string): void {
    this.stop();
    this.stream.write(`\r✗ ${message}\n`);
  }
}
