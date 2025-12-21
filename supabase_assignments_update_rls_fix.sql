-- Fix RLS UPDATE policy for assignments
-- Match the exact pattern used in quizzes and learning_content tables
-- which are working correctly

-- Drop the existing UPDATE policy
DROP POLICY IF EXISTS "Teachers can update class assignments" ON assignments;

-- Recreate with the exact same pattern as quizzes/learning_content
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

