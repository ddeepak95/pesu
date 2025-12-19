-- Migration to update voice_messages table for disconnect handling and interruption tracking
-- Run this AFTER the initial voice_messages table has been created

-- Make audio_file_url nullable (for disconnect fallback - save transcript without audio)
ALTER TABLE voice_messages ALTER COLUMN audio_file_url DROP NOT NULL;

-- Add interrupted flag to track when audio was cut short
ALTER TABLE voice_messages ADD COLUMN IF NOT EXISTS interrupted BOOLEAN DEFAULT FALSE;

-- Add spoken_at timestamp for accurate timing analysis
ALTER TABLE voice_messages ADD COLUMN IF NOT EXISTS spoken_at TIMESTAMP WITH TIME ZONE;

-- Add generated_content to store full LLM text (even if not fully spoken)
ALTER TABLE voice_messages ADD COLUMN IF NOT EXISTS generated_content TEXT;

-- Update comments
COMMENT ON COLUMN voice_messages.audio_file_url IS 'URL to the audio file stored in Firebase Storage (nullable for disconnect fallback)';
COMMENT ON COLUMN voice_messages.interrupted IS 'True if the utterance was interrupted (audio is partial, transcript is full)';
COMMENT ON COLUMN voice_messages.spoken_at IS 'Timestamp when the utterance was spoken (for accurate timing analysis)';
COMMENT ON COLUMN voice_messages.generated_content IS 'Full LLM-generated text for assistant messages (may be longer than content if interrupted)';

-- Verify the changes
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'voice_messages'
ORDER BY ordinal_position;

