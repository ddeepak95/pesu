-- Add recording_started_at to submission_session_audio
-- Records the UTC timestamp when audiobuffer.start_recording() was called for a session
ALTER TABLE submission_session_audio
  ADD COLUMN IF NOT EXISTS recording_started_at timestamptz;
COMMENT ON COLUMN submission_session_audio.recording_started_at
  IS 'UTC timestamp when audiobuffer.start_recording() was called for this session';
