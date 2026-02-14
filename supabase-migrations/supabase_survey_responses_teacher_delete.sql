-- Allow teachers to delete survey responses for their class surveys (e.g. reset so student can resubmit)

CREATE POLICY "Teachers can delete survey responses"
  ON survey_responses FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM surveys s
      JOIN classes c ON c.id = s.class_id
      WHERE s.id = survey_responses.survey_id
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
