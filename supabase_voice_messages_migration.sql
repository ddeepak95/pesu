-- Migration to create voice_messages table for storing voice assessment messages
-- This table stores voice messages with associated audio file URLs

-- Create voice_messages table
CREATE TABLE IF NOT EXISTS voice_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id TEXT,
  assignment_id TEXT NOT NULL,
  question_order INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'assistant')),
  content TEXT NOT NULL,
  audio_file_url TEXT NOT NULL,
  attempt_number INTEGER,
  duration_seconds NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_voice_messages_submission_id ON voice_messages(submission_id);
CREATE INDEX IF NOT EXISTS idx_voice_messages_assignment_id ON voice_messages(assignment_id);
CREATE INDEX IF NOT EXISTS idx_voice_messages_question_order ON voice_messages(question_order);
CREATE INDEX IF NOT EXISTS idx_voice_messages_attempt_number ON voice_messages(attempt_number);
CREATE INDEX IF NOT EXISTS idx_voice_messages_submission_question ON voice_messages(submission_id, question_order, attempt_number);

-- Add comments
COMMENT ON TABLE voice_messages IS 'Stores voice messages with audio file URLs from voice assessment sessions';
COMMENT ON COLUMN voice_messages.submission_id IS 'References submissions.submission_id (nullable for messages before submission creation)';
COMMENT ON COLUMN voice_messages.assignment_id IS 'References assignments.assignment_id';
COMMENT ON COLUMN voice_messages.question_order IS 'Order of the question in the assignment (0-indexed or 1-indexed based on assignment structure)';
COMMENT ON COLUMN voice_messages.role IS 'Role of the speaker: student or assistant';
COMMENT ON COLUMN voice_messages.content IS 'Transcript text of the voice message';
COMMENT ON COLUMN voice_messages.audio_file_url IS 'URL to the audio file stored in Firebase Storage (required)';
COMMENT ON COLUMN voice_messages.attempt_number IS 'Attempt number for grouping messages by evaluation attempt';
COMMENT ON COLUMN voice_messages.duration_seconds IS 'Duration of the audio recording in seconds (optional)';

-- Enable Row Level Security (RLS)
ALTER TABLE voice_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to create voice messages (public access for submissions)
CREATE POLICY "Allow public to create voice messages"
ON voice_messages
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Policy: Allow anyone to read voice messages (for now - can be restricted later)
CREATE POLICY "Allow public to read voice messages"
ON voice_messages
FOR SELECT
TO anon, authenticated
USING (true);

-- Verify the table creation
SELECT 
  table_name, 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'voice_messages'
ORDER BY ordinal_position;
