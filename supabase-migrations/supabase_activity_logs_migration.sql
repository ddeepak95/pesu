-- Activity Logs Migration
-- Tracks student time spent on different components (assignments, questions, attempts, learning content, quizzes)

-- Create the activity_logs table
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,                     -- Unique per tracking session (for upsert)
  user_id UUID REFERENCES auth.users(id),       -- For authenticated students
  submission_id TEXT,                           -- For assignment/question/attempt tracking
  class_id UUID,                                -- Class context
  component_type TEXT NOT NULL,                 -- 'assignment' | 'question' | 'attempt' | 'learning_content' | 'quiz'
  component_id TEXT NOT NULL,                   -- assignment_id, learning_content_id, quiz_id
  sub_component_id TEXT,                        -- question_order for questions, attempt_number for attempts
  total_time_ms BIGINT NOT NULL,                -- Total elapsed time in milliseconds
  active_time_ms BIGINT NOT NULL,               -- Active time (excludes idle + hidden)
  idle_time_ms BIGINT DEFAULT 0,                -- Time spent idle
  hidden_time_ms BIGINT DEFAULT 0,              -- Time tab was hidden
  started_at TIMESTAMPTZ NOT NULL,              -- When student started
  ended_at TIMESTAMPTZ NOT NULL,                -- When student finished/left
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),         -- For tracking periodic updates
  metadata JSONB                                -- Additional context if needed
);

-- Unique constraint for upsert (periodic saves update same row)
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_logs_session ON activity_logs(session_id);

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_component ON activity_logs(component_type, component_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_class_id ON activity_logs(class_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_started_at ON activity_logs(started_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_submission_id ON activity_logs(submission_id);

-- Enable RLS
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Students can insert their own activity logs
CREATE POLICY "Students can insert own activity logs"
  ON activity_logs
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id OR user_id IS NULL
  );

-- Students can update their own activity logs (for periodic saves)
CREATE POLICY "Students can update own activity logs"
  ON activity_logs
  FOR UPDATE
  USING (
    auth.uid() = user_id OR user_id IS NULL
  )
  WITH CHECK (
    auth.uid() = user_id OR user_id IS NULL
  );

-- Students can view their own activity logs
CREATE POLICY "Students can view own activity logs"
  ON activity_logs
  FOR SELECT
  USING (
    auth.uid() = user_id
  );

-- Teachers can view activity logs for their classes
CREATE POLICY "Teachers can view class activity logs"
  ON activity_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM class_teachers ct
      WHERE ct.class_id = activity_logs.class_id
      AND ct.teacher_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = activity_logs.class_id
      AND c.created_by = auth.uid()
    )
  );

-- Allow anonymous inserts (for public assignments without login)
CREATE POLICY "Allow anonymous activity log inserts"
  ON activity_logs
  FOR INSERT
  WITH CHECK (
    user_id IS NULL
  );

-- Allow anonymous updates (for periodic saves on public assignments)
CREATE POLICY "Allow anonymous activity log updates"
  ON activity_logs
  FOR UPDATE
  USING (
    user_id IS NULL AND session_id IS NOT NULL
  )
  WITH CHECK (
    user_id IS NULL
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_activity_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS activity_logs_updated_at ON activity_logs;
CREATE TRIGGER activity_logs_updated_at
  BEFORE UPDATE ON activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_activity_logs_updated_at();

-- Comment on table
COMMENT ON TABLE activity_logs IS 'Tracks student time spent on different platform components';
COMMENT ON COLUMN activity_logs.session_id IS 'Unique identifier per tracking session, used for upsert during periodic saves';
COMMENT ON COLUMN activity_logs.component_type IS 'Type of component: assignment, question, attempt, learning_content, quiz';
COMMENT ON COLUMN activity_logs.sub_component_id IS 'Sub-component identifier: question_order for questions, attempt_number for attempts';
