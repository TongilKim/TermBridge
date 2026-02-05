export type MessageType = 'output' | 'input' | 'error' | 'system';

export type PermissionMode =
  | 'default' // Ask before making changes
  | 'acceptEdits' // Auto-approve file edits
  | 'plan' // Plan mode (read-only, no execution)
  | 'bypassPermissions' // Yolo mode (bypass all prompts)
  // Legacy/internal modes - kept for SDK compatibility
  | 'delegate' // Used when sub-agents are running
  | 'dontAsk'; // Internal mode for certain SDK contexts

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
  | 'mobile-disconnect'
  | 'interactive-request'
  | 'interactive-response'
  | 'interactive-apply'
  | 'interactive-confirm'
  | 'clear-request'; // Request to clear conversation (doesn't appear in chat)

export type InteractiveCommandType =
  | 'config'
  | 'permissions'
  | 'allowed-tools'
  | 'vim'
  | 'mcp'
  | 'agents'
  | 'hooks';

export type InteractiveUIType =
  | 'select'
  | 'toggle'
  | 'multi-select'
  | 'nested';

export interface InteractiveOption {
  id: string;
  label: string;
  description?: string;
  value: unknown;
  selected?: boolean;
  children?: InteractiveOption[];
}

export interface InteractiveCommandData {
  command: InteractiveCommandType;
  uiType: InteractiveUIType;
  title: string;
  description?: string;
  options: InteractiveOption[];
  currentValue?: unknown;
}

export interface InteractiveApplyPayload {
  command: InteractiveCommandType;
  action: 'set' | 'add' | 'remove' | 'toggle';
  key?: string;
  value: unknown;
}

export interface InteractiveResult {
  success: boolean;
  message?: string;
}

export interface RealtimeMessage {
  type: RealtimeMessageType;
  content?: string;
  attachments?: ImageAttachment[];
  permissionMode?: PermissionMode;
  commands?: SlashCommand[];
  model?: string;
  availableModels?: ModelInfo[];
  interactiveCommand?: InteractiveCommandType;
  interactiveData?: InteractiveCommandData;
  interactivePayload?: InteractiveApplyPayload;
  interactiveResult?: InteractiveResult;
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
