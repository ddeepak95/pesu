-- Alternative RLS fix for assignments UPDATE policy
-- This version tries using a function or making WITH CHECK more explicit
-- Sometimes PostgreSQL has issues resolving column references in WITH CHECK

-- First, let's try making WITH CHECK identical to USING (simpler approach)
-- Drop the existing UPDATE policy
DROP POLICY IF EXISTS "Teachers can update class assignments" ON assignments;

-- Version 1: Make WITH CHECK identical to USING
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
  WITH CHECK (
    -- Same check as USING - this should work since we're not changing class_id
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
  );

