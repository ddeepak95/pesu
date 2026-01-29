-- ALTER migration to simplify existing activity_logs table
-- Run this on DEV database that already has the old schema

-- Make the old columns nullable or have defaults (so they're not required)
ALTER TABLE activity_logs 
  ALTER COLUMN active_time_ms SET DEFAULT 0,
  ALTER COLUMN active_time_ms DROP NOT NULL;

ALTER TABLE activity_logs 
  ALTER COLUMN idle_time_ms SET DEFAULT 0,
  ALTER COLUMN idle_time_ms DROP NOT NULL;

ALTER TABLE activity_logs 
  ALTER COLUMN hidden_time_ms SET DEFAULT 0,
  ALTER COLUMN hidden_time_ms DROP NOT NULL;

ALTER TABLE activity_logs 
  ALTER COLUMN started_at SET DEFAULT now(),
  ALTER COLUMN started_at DROP NOT NULL;

ALTER TABLE activity_logs 
  ALTER COLUMN ended_at SET DEFAULT now(),
  ALTER COLUMN ended_at DROP NOT NULL;

-- Now create the activity_events table if it doesn't exist
CREATE TABLE IF NOT EXISTS activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  submission_id TEXT,
  class_id UUID,
  component_type TEXT NOT NULL,
  component_id TEXT NOT NULL,
  sub_component_id TEXT,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for activity_events
CREATE INDEX IF NOT EXISTS idx_activity_events_user_id ON activity_events(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_component ON activity_events(component_type, component_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_class_id ON activity_events(class_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_submission_id ON activity_events(submission_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON activity_events(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_events_event_type ON activity_events(event_type);

-- Enable RLS
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for activity_events (drop first if they exist)
DROP POLICY IF EXISTS "Students can insert own activity events" ON activity_events;
DROP POLICY IF EXISTS "Students can view own activity events" ON activity_events;
DROP POLICY IF EXISTS "Teachers can view class activity events" ON activity_events;
DROP POLICY IF EXISTS "Allow anonymous activity event inserts" ON activity_events;

CREATE POLICY "Students can insert own activity events"
  ON activity_events FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Students can view own activity events"
  ON activity_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Teachers can view class activity events"
  ON activity_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM class_teachers ct
      WHERE ct.class_id = activity_events.class_id
      AND ct.teacher_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = activity_events.class_id
      AND c.created_by = auth.uid()
    )
  );

CREATE POLICY "Allow anonymous activity event inserts"
  ON activity_events FOR INSERT
  WITH CHECK (user_id IS NULL);
