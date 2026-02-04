-- Add model column to sessions table for per-session model persistence
ALTER TABLE sessions ADD COLUMN model TEXT DEFAULT 'default';

-- Add comment for documentation
COMMENT ON COLUMN sessions.model IS 'The Claude model being used for this session (e.g., default, opus, haiku)';
