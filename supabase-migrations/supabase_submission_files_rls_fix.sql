-- Add INSERT/UPDATE/DELETE RLS policies for submission_files.
-- The original migration only had SELECT policies.

-- INSERT: Authenticated users can insert files for their own submissions
CREATE POLICY "Users can insert files for their submissions" ON submission_files
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM submissions s
      WHERE s.submission_id = submission_files.submission_id
      AND s.student_id = auth.uid()
    )
  );

-- INSERT: Anon can insert files for public assignment submissions
CREATE POLICY "Anyone can insert files for public assignment submissions" ON submission_files
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.assignment_id = submission_files.assignment_id
      AND a.is_public = true
    )
  );

-- UPDATE: Authenticated users can update their own files (e.g. confirm-upload)
CREATE POLICY "Users can update their submission files" ON submission_files
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM submissions s
      WHERE s.submission_id = submission_files.submission_id
      AND s.student_id = auth.uid()
    )
  );

-- UPDATE: Anon can update files for public assignment submissions
CREATE POLICY "Anyone can update files for public assignment submissions" ON submission_files
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.assignment_id = submission_files.assignment_id
      AND a.is_public = true
    )
  );

-- DELETE: Authenticated users can delete their own files
CREATE POLICY "Users can delete their submission files" ON submission_files
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM submissions s
      WHERE s.submission_id = submission_files.submission_id
      AND s.student_id = auth.uid()
    )
  );

-- DELETE: Anon can delete files for public assignment submissions
CREATE POLICY "Anyone can delete files for public assignment submissions" ON submission_files
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM assignments a
      WHERE a.assignment_id = submission_files.assignment_id
      AND a.is_public = true
    )
  );
