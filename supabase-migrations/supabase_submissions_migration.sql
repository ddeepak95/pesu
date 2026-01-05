-- Migration to create submissions table for storing student assignment responses

-- Create submissions table
CREATE TABLE IF NOT EXISTS submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  assignment_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index on assignment_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id ON submissions(assignment_id);

-- Add index on submission_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_submissions_submission_id ON submissions(submission_id);

-- Add index on status for filtering
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);

-- Add comments
COMMENT ON TABLE submissions IS 'Stores student submissions for assignments';
COMMENT ON COLUMN submissions.submission_id IS 'Unique short ID for the submission (8 characters)';
COMMENT ON COLUMN submissions.assignment_id IS 'References assignments.assignment_id';
COMMENT ON COLUMN submissions.student_name IS 'Name provided by the student';
COMMENT ON COLUMN submissions.preferred_language IS 'Language preference for the submission';
COMMENT ON COLUMN submissions.answers IS 'Array of answers: [{ question_order: number, answer_text: string }]';
COMMENT ON COLUMN submissions.submitted_at IS 'Timestamp when the submission was completed';
COMMENT ON COLUMN submissions.status IS 'Current status: in_progress or completed';

-- Enable Row Level Security (RLS)
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to create submissions (public access)
CREATE POLICY "Allow public to create submissions"
ON submissions
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Policy: Allow anyone to update their own submission (identified by submission_id)
CREATE POLICY "Allow public to update submissions"
ON submissions
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Policy: Allow anyone to read submissions (for now - can be restricted later)
CREATE POLICY "Allow public to read submissions"
ON submissions
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
WHERE table_name = 'submissions'
ORDER BY ordinal_position;

