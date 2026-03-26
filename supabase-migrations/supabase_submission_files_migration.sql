-- Create submission_files table for tracking files uploaded by students.
-- Actual files are stored in Google Cloud Storage (Firebase Storage).

CREATE TABLE IF NOT EXISTS submission_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT,
  storage_path TEXT NOT NULL,
  parsed_content_url TEXT,
  processing_status TEXT NOT NULL DEFAULT 'uploading',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT submission_files_processing_status_check
    CHECK (processing_status IN ('uploading', 'uploaded', 'processing', 'processed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_submission_files_submission_id ON submission_files(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_files_assignment_id ON submission_files(assignment_id);

-- Trigger to auto-update updated_at
CREATE TRIGGER update_submission_files_updated_at
  BEFORE UPDATE ON submission_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE submission_files ENABLE ROW LEVEL SECURITY;

-- Students can read their own files (via submission ownership)
CREATE POLICY "Students can view their submission files" ON submission_files
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM submissions s
      WHERE s.submission_id = submission_files.submission_id
      AND s.student_id = auth.uid()
    )
  );

-- Teachers can view files for assignments in their classes
CREATE POLICY "Teachers can view submission files for their classes" ON submission_files
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM assignments a
      JOIN classes c ON c.id = a.class_id
      WHERE a.assignment_id = submission_files.assignment_id
      AND (
        c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM class_teachers ct
          WHERE ct.class_id = c.id
          AND ct.teacher_id = auth.uid()
        )
      )
    )
  );

-- Public (anon) can read files for public assignment submissions
CREATE POLICY "Anyone can view files for public assignment submissions" ON submission_files
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.assignment_id = submission_files.assignment_id
      AND a.is_public = true
    )
  );

-- Server-side API routes handle INSERT/UPDATE/DELETE using the service role,
-- so no INSERT/UPDATE/DELETE policies are needed for regular users.
-- The server Supabase client bypasses RLS when using the service role key.
