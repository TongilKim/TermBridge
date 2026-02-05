import { EventEmitter } from 'events';
import type { RealtimeMessage, RealtimeMessageType } from 'termbridge-shared';

export type HandlerCallback = (message: RealtimeMessage) => void;

export class MessageHandler extends EventEmitter {
  private handlers: Map<RealtimeMessageType, HandlerCallback[]> = new Map();

  registerHandler(type: RealtimeMessageType, callback: HandlerCallback): void {
    const existing = this.handlers.get(type) || [];
    existing.push(callback);
    this.handlers.set(type, existing);
  }

  handleMessage(message: RealtimeMessage): void {
    const handlers = this.handlers.get(message.type);

    if (handlers && handlers.length > 0) {
      for (const handler of handlers) {
        handler(message);
      }
    }

    // Emit event for the message type
    this.emit(message.type, message);
  }

  removeHandler(type: RealtimeMessageType, callback: HandlerCallback): void {
    const existing = this.handlers.get(type);
    if (existing) {
      const index = existing.indexOf(callback);
      if (index !== -1) {
        existing.splice(index, 1);
      }
    }
  }

  clearHandlers(type?: RealtimeMessageType): void {
    if (type) {
      this.handlers.delete(type);
    } else {
      this.handlers.clear();
    }
  }
}
