-- Create surveys table (teacher-created surveys with Likert and open-ended questions)
CREATE TABLE IF NOT EXISTS surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id TEXT UNIQUE NOT NULL,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  class_group_id UUID REFERENCES class_groups(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'deleted'))
);

COMMENT ON COLUMN surveys.questions IS 'Array of survey question objects: order, type (likert|open_ended), prompt, options (for likert), required';

CREATE INDEX IF NOT EXISTS idx_surveys_class_id ON surveys(class_id);
CREATE INDEX IF NOT EXISTS idx_surveys_survey_id ON surveys(survey_id);
CREATE INDEX IF NOT EXISTS idx_surveys_status ON surveys(status);
CREATE INDEX IF NOT EXISTS idx_surveys_class_group_id ON surveys(class_group_id);

ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;

-- RLS policies for surveys (mirrors quiz access rules)
CREATE POLICY "Teachers can view their class surveys" ON surveys
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = surveys.class_id
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

CREATE POLICY "Teachers can create surveys for their classes" ON surveys
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = surveys.class_id
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

CREATE POLICY "Teachers can update their class surveys" ON surveys
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = surveys.class_id
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
      WHERE classes.id = surveys.class_id
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

CREATE POLICY "Teachers can delete their class surveys" ON surveys
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = surveys.class_id
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

-- Students can view active surveys in their assigned group
CREATE POLICY "Students can view active surveys in their group" ON surveys
  FOR SELECT
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM class_group_memberships cgm
      WHERE cgm.group_id = surveys.class_group_id
      AND cgm.student_id = auth.uid()
    )
  );

-- Create survey_responses table (stores student responses)
CREATE TABLE IF NOT EXISTS survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(survey_id, student_id)
);

COMMENT ON COLUMN survey_responses.answers IS 'Array of answer objects: question_order, value (string for open_ended, number for likert)';

CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_id ON survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_student_id ON survey_responses(student_id);

ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;

-- RLS policies for survey_responses
CREATE POLICY "Students can view their own responses" ON survey_responses
  FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "Students can submit their own responses" ON survey_responses
  FOR INSERT
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM surveys s
      WHERE s.id = survey_responses.survey_id
      AND s.status = 'active'
      AND EXISTS (
        SELECT 1 FROM class_group_memberships cgm
        WHERE cgm.group_id = s.class_group_id
        AND cgm.student_id = auth.uid()
      )
    )
  );

-- Teachers can view responses for their class surveys
CREATE POLICY "Teachers can view survey responses" ON survey_responses
  FOR SELECT
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

-- Update content_items type constraint to include 'survey'
ALTER TABLE content_items 
DROP CONSTRAINT IF EXISTS content_items_type_check;

ALTER TABLE content_items 
ADD CONSTRAINT content_items_type_check 
CHECK (type IN ('quiz', 'learning_content', 'formative_assignment', 'survey'));

-- updated_at trigger for surveys
DROP TRIGGER IF EXISTS update_surveys_updated_at ON surveys;
CREATE TRIGGER update_surveys_updated_at
  BEFORE UPDATE ON surveys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
