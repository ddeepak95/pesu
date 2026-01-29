-- Activity Events Migration
-- Simple INSERT-only event log for tracking when students start/end activities

-- Create the activity_events table
CREATE TABLE IF NOT EXISTS activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),       -- For authenticated students (NULL for public)
  submission_id TEXT,                           -- For assignment/question tracking
  class_id UUID,                                -- Class context
  component_type TEXT NOT NULL,                 -- 'assignment' | 'question' | 'learning_content' | 'quiz'
  component_id TEXT NOT NULL,                   -- assignment_id, learning_content_id, quiz_id
  sub_component_id TEXT,                        -- question_order for questions
  event_type TEXT NOT NULL,                     -- 'attempt_started' | 'attempt_ended'
  created_at TIMESTAMPTZ DEFAULT now()          -- When the event occurred
);

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_activity_events_user_id ON activity_events(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_component ON activity_events(component_type, component_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_class_id ON activity_events(class_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_submission_id ON activity_events(submission_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON activity_events(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_events_event_type ON activity_events(event_type);

-- Enable RLS
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Students can insert their own activity events
CREATE POLICY "Students can insert own activity events"
  ON activity_events
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id OR user_id IS NULL
  );

-- Students can view their own activity events
CREATE POLICY "Students can view own activity events"
  ON activity_events
  FOR SELECT
  USING (
    auth.uid() = user_id
  );

-- Teachers can view activity events for their classes
CREATE POLICY "Teachers can view class activity events"
  ON activity_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM class_teachers ct
      WHERE ct.class_id = activity_events.class_id
      AND ct.teacher_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = activity_events.class_id
      AND c.created_by = auth.uid()
    )
  );

-- Allow anonymous inserts (for public assignments without login)
CREATE POLICY "Allow anonymous activity event inserts"
  ON activity_events
  FOR INSERT
  WITH CHECK (
    user_id IS NULL
  );

-- Comment on table
COMMENT ON TABLE activity_events IS 'INSERT-only event log for tracking when students start/end activities';
COMMENT ON COLUMN activity_events.event_type IS 'Type of event: attempt_started, attempt_ended';
COMMENT ON COLUMN activity_events.component_type IS 'Type of component: assignment, question, learning_content, quiz';
