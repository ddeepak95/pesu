-- Allow teachers to delete any completion (quiz, learning_content, survey, assignment)
-- for content items in their classes (e.g. reset student progress).
-- Replaces the quiz-only policy so reset progress clears all content types.

DROP POLICY IF EXISTS "Teachers can delete quiz completions" ON student_content_completions;

CREATE POLICY "Teachers can delete class completions"
  ON student_content_completions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM content_items ci
      JOIN classes c ON c.id = ci.class_id
      WHERE ci.id = student_content_completions.content_item_id
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
