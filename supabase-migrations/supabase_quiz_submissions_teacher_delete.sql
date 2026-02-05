-- Allow teachers to delete quiz submissions for their classes

CREATE POLICY "Teachers can delete class quiz submissions"
  ON quiz_submissions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = quiz_submissions.class_id
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

