-- TEST: Temporarily make WITH CHECK always true to isolate the issue
-- WARNING: This is less secure - only use for testing!

-- Drop the existing UPDATE policy
DROP POLICY IF EXISTS "Teachers can update class assignments" ON assignments;

-- Test version with permissive WITH CHECK
CREATE POLICY "Teachers can update class assignments" ON assignments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = assignments.class_id
      AND (
        classes.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM class_teachers
          WHERE class_teachers.class_id = classes.id
          AND class_teachers.teacher_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (true);  -- Always allow the update if USING passes

