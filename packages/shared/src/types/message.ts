export type MessageType = 'output' | 'input' | 'error' | 'system';

export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'bypassPermissions'
  | 'delegate'
  | 'dontAsk';

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
  | 'pong'
  | 'mode'
  | 'mode-change'
  | 'commands'
  | 'commands-request'
  | 'model'
  | 'model-change'
  | 'models'
  | 'models-request'
  | 'mobile-disconnect';

export interface RealtimeMessage {
  type: RealtimeMessageType;
  content?: string;
  attachments?: ImageAttachment[];
  permissionMode?: PermissionMode;
  commands?: SlashCommand[];
  model?: string;
  availableModels?: ModelInfo[];
  timestamp: number;
  seq: number;
}

export interface ModelInfo {
  value: string;
  displayName: string;
  description: string;
}

export interface ImageAttachment {
  type: 'image';
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  data: string;
}

export interface SlashCommand {
  name: string;
  description: string;
  argumentHint: string;
}
