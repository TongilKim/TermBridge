import { EventEmitter } from 'events';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface ConnectionConfig {
  heartbeatInterval: number; // ms
  heartbeatTimeout: number; // ms
  maxRetries: number;
  baseDelay: number; // ms
  maxDelay: number; // ms
}

const DEFAULT_CONFIG: ConnectionConfig = {
  heartbeatInterval: 15000, // 15s
  heartbeatTimeout: 30000, // 30s
  maxRetries: 10,
  baseDelay: 1000, // 1s
  maxDelay: 30000, // 30s
};

interface Client {
  connect(): Promise<void>;
  sendOutput(content: string, type: string): void;
}

export class ConnectionManager extends EventEmitter {
  private state: ConnectionState = 'disconnected';
  private config: ConnectionConfig;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastPongAt: number = 0;
  private retryCount = 0;
  private client: Client;

  constructor(client: Client, config: Partial<ConnectionConfig> = {}) {
    super();
    this.client = client;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getState(): ConnectionState {
    return this.state;
  }

  private setState(newState: ConnectionState): void {
    const oldState = this.state;
    this.state = newState;
    this.emit('stateChange', { from: oldState, to: newState });
  }

  start(): void {
    this.setState('connected');
    this.lastPongAt = Date.now();
    this.startHeartbeat();
  }

  stop(): void {
    this.stopHeartbeat();
    this.setState('disconnected');
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.checkConnection();
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private checkConnection(): void {
    const now = Date.now();

    // Send ping
    this.client.sendOutput('', 'ping');

    // Check for timeout
    if (now - this.lastPongAt > this.config.heartbeatTimeout) {
      this.handleDisconnect();
    }
  }

  onPong(): void {
    this.lastPongAt = Date.now();
    if (this.state === 'reconnecting') {
      this.setState('connected');
      this.retryCount = 0;
    }
  }

  private handleDisconnect(): void {
    if (this.state === 'disconnected') return;

    this.setState('reconnecting');
    this.attemptReconnect();
  }

  private async attemptReconnect(): Promise<void> {
    if (this.retryCount >= this.config.maxRetries) {
      this.setState('disconnected');
      this.emit('maxRetriesExceeded');
      return;
    }

    const delay = this.calculateBackoff();
    this.retryCount++;

    this.emit('reconnecting', { attempt: this.retryCount, delay });

    await this.sleep(delay);

    try {
      await this.client.connect();
      this.setState('connected');
      this.retryCount = 0;
      this.lastPongAt = Date.now();
      this.emit('reconnected');
    } catch {
      this.attemptReconnect();
    }
  }

  // Exponential backoff with jitter
  private calculateBackoff(): number {
    const exponentialDelay = Math.min(
      this.config.baseDelay * Math.pow(2, this.retryCount),
      this.config.maxDelay
    );
    // ±20% jitter
    const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
    return Math.floor(exponentialDelay + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
