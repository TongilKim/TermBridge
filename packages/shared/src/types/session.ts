export type SessionStatus = 'active' | 'paused' | 'ended';

export interface Session {
  id: string;
  machine_id: string;
  status: SessionStatus;
  working_directory?: string;
  model?: string;
  sdk_session_id?: string; // Anthropic SDK session ID for resuming
  started_at: string;
  ended_at?: string;
}
