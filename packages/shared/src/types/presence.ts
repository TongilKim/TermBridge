/**
 * Type of client tracking presence in a session.
 */
export type PresenceType = 'cli' | 'mobile';

/**
 * Payload for Supabase Presence tracking.
 * Used by CLI and mobile clients to announce their online status.
 */
export interface PresencePayload {
  type: PresenceType;
  online_at: string;
}
