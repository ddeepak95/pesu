-- Migration: Add RLS policy to allow teachers to view submissions for assignments in their classes
-- Requires:
--   - supabase_submissions_migration.sql
--   - supabase_submissions_student_id_migration.sql
--   - supabase_assignments_complete_rls_fix.sql (for reference on teacher identification)

-- Policy: Teachers can view submissions for assignments in classes they teach
-- This allows teachers to see all student submissions for assignments in their classes
DROP POLICY IF EXISTS "Teachers can view submissions for their class assignments" ON submissions;
CREATE POLICY "Teachers can view submissions for their class assignments" ON submissions
  FOR SELECT
  USING (
    -- Check if the submission's assignment belongs to a class where the user is a teacher
    EXISTS (
      SELECT 1 FROM assignments
      INNER JOIN classes ON classes.id = assignments.class_id
      WHERE assignments.assignment_id = submissions.assignment_id
      AND (
        -- User is the class owner
        classes.created_by = auth.uid()
        OR
        -- User is a co-teacher
        EXISTS (
          SELECT 1 FROM class_teachers
          WHERE class_teachers.class_id = classes.id
          AND class_teachers.teacher_id = auth.uid()
        )
      )
    )
  );

-- Policy: Teachers can update submissions for assignments in classes they teach
-- This allows teachers to mark attempts as stale (reset attempts)
DROP POLICY IF EXISTS "Teachers can update submissions for their class assignments" ON submissions;
CREATE POLICY "Teachers can update submissions for their class assignments" ON submissions
  FOR UPDATE
  USING (
    -- Check if the submission's assignment belongs to a class where the user is a teacher
    EXISTS (
      SELECT 1 FROM assignments
      INNER JOIN classes ON classes.id = assignments.class_id
      WHERE assignments.assignment_id = submissions.assignment_id
      AND (
        -- User is the class owner
        classes.created_by = auth.uid()
        OR
        -- User is a co-teacher
        EXISTS (
          SELECT 1 FROM class_teachers
          WHERE class_teachers.class_id = classes.id
          AND class_teachers.teacher_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    -- Same check for WITH CHECK clause
    EXISTS (
      SELECT 1 FROM assignments
      INNER JOIN classes ON classes.id = assignments.class_id
      WHERE assignments.assignment_id = submissions.assignment_id
      AND (
        classes.created_by = auth.uid()
        OR
        EXISTS (
          SELECT 1 FROM class_teachers
          WHERE class_teachers.class_id = classes.id
          AND class_teachers.teacher_id = auth.uid()
        )
      )
    )
  );

-- Verify the policies were created
SELECT policyname, cmd, permissive 
FROM pg_policies 
WHERE tablename = 'submissions' 
ORDER BY policyname;

