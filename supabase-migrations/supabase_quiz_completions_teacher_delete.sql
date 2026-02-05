-- Allow teachers to delete quiz completions for content items in their classes

CREATE POLICY "Teachers can delete quiz completions"
  ON student_content_completions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM content_items ci
      JOIN classes c ON ci.class_id = c.id
      WHERE ci.id = student_content_completions.content_item_id
      AND ci.type = 'quiz'
      AND (
        c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM class_teachers
          WHERE class_teachers.class_id = c.id
          AND class_teachers.teacher_id = auth.uid()
        )
      )
    )
  );

