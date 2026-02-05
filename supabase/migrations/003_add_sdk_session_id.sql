-- Add sdk_session_id column for session resume functionality
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS sdk_session_id TEXT;

-- Create index for faster lookups when resuming sessions
CREATE INDEX IF NOT EXISTS idx_sessions_sdk_session_id ON sessions(sdk_session_id);
