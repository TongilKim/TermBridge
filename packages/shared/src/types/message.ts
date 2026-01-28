export type MessageType = 'output' | 'input' | 'error' | 'system';

export interface Message {
  id: number;
  session_id: string;
  type: MessageType;
  content: string;
  created_at: string;
}

export type RealtimeMessageType =
  | 'output'
  | 'input'
  | 'error'
  | 'system'
  | 'ping'
  | 'pong';

export interface RealtimeMessage {
  type: RealtimeMessageType;
  content?: string;
  timestamp: number;
  seq: number;
}
