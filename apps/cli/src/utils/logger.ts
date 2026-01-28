type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private silent: boolean;
  private debugEnabled: boolean;

  constructor() {
    this.silent = process.env['SILENT'] === 'true';
    this.debugEnabled = process.env['DEBUG'] === 'true';
  }

  private formatTimestamp(): string {
    const now = new Date();
    return now.toTimeString().split(' ')[0] ?? now.toISOString();
  }

  private formatMessage(level: LogLevel, message: string, data?: object): string {
    const timestamp = this.formatTimestamp();
    const levelStr = level.toUpperCase().padEnd(5);
    let formatted = `[${timestamp}] [${levelStr}] ${message}`;

    if (data) {
      formatted += ` ${JSON.stringify(data)}`;
    }

    return formatted;
  }

  debug(message: string, data?: object): void {
    if (this.silent || !this.debugEnabled) return;
    console.log(this.formatMessage('debug', message, data));
  }

  info(message: string, data?: object): void {
    if (this.silent) return;
    console.log(this.formatMessage('info', message, data));
  }

  warn(message: string, data?: object): void {
    if (this.silent) return;
    console.warn(this.formatMessage('warn', message, data));
  }

  error(message: string, data?: object): void {
    if (this.silent) return;
    console.error(this.formatMessage('error', message, data));
  }
}

// Default singleton instance
let defaultLogger: Logger | null = null;

export function getLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger();
  }
  return defaultLogger;
}
