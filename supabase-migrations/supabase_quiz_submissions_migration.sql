-- Migration to create quiz_submissions table for student quiz answers

CREATE TABLE IF NOT EXISTS quiz_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(quiz_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_submissions_quiz_id ON quiz_submissions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_submissions_class_id ON quiz_submissions(class_id);
CREATE INDEX IF NOT EXISTS idx_quiz_submissions_student_id ON quiz_submissions(student_id);

COMMENT ON TABLE quiz_submissions IS 'Stores student submissions for quizzes';
COMMENT ON COLUMN quiz_submissions.quiz_id IS 'References quizzes.id';
COMMENT ON COLUMN quiz_submissions.class_id IS 'References classes.id';
COMMENT ON COLUMN quiz_submissions.student_id IS 'Authenticated student id';
COMMENT ON COLUMN quiz_submissions.answers IS 'Array of answers: [{ question_id: string, selected_option_id: string }]';
COMMENT ON COLUMN quiz_submissions.submitted_at IS 'Timestamp when the submission was completed';

ALTER TABLE quiz_submissions ENABLE ROW LEVEL SECURITY;

-- Students can insert their own submissions
CREATE POLICY "Students can insert own quiz submissions"
  ON quiz_submissions FOR INSERT
  WITH CHECK (auth.uid() = student_id);

-- Students can view their own submissions
CREATE POLICY "Students can view own quiz submissions"
  ON quiz_submissions FOR SELECT
  USING (auth.uid() = student_id);

-- Teachers can view submissions for quizzes in their classes
CREATE POLICY "Teachers can view class quiz submissions"
  ON quiz_submissions FOR SELECT
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

