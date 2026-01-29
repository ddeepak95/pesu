-- Activity Tracking Production Migration
-- Creates both activity_logs (periodic time tracking) and activity_events (start/end timestamps)
-- Run this on a fresh production database

-- ============================================
-- TABLE 1: activity_logs (Periodic Time Tracking)
-- ============================================
-- Tracks total time spent on components via periodic upserts (every 10 seconds)

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,                     -- Stable ID for upsert (browser_session + component identity)
  user_id UUID REFERENCES auth.users(id),       -- For authenticated students (NULL for public)
  submission_id TEXT,                           -- For assignment/question tracking
  class_id UUID,                                -- Class context
  component_type TEXT NOT NULL,                 -- 'assignment' | 'question' | 'learning_content' | 'quiz'
  component_id TEXT NOT NULL,                   -- assignment_id, learning_content_id, quiz_id
  sub_component_id TEXT,                        -- question_order for questions
  total_time_ms BIGINT NOT NULL DEFAULT 0,      -- Total time in milliseconds
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint for upsert (periodic saves update same row)
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_logs_session ON activity_logs(session_id);

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_component ON activity_logs(component_type, component_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_class_id ON activity_logs(class_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_submission_id ON activity_logs(submission_id);

-- Enable RLS
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for activity_logs
CREATE POLICY "Students can insert own activity logs"
  ON activity_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Students can update own activity logs"
  ON activity_logs FOR UPDATE
  USING (auth.uid() = user_id OR user_id IS NULL)
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Students can view own activity logs"
  ON activity_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Teachers can view class activity logs"
  ON activity_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM class_teachers ct
      WHERE ct.class_id = activity_logs.class_id
      AND ct.teacher_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM classes c
      WHERE c.id = activity_logs.class_id
      AND c.created_by = auth.uid()
    )
  );

CREATE POLICY "Allow anonymous activity log inserts"
  ON activity_logs FOR INSERT
  WITH CHECK (user_id IS NULL);

CREATE POLICY "Allow anonymous activity log updates"
  ON activity_logs FOR UPDATE
  USING (user_id IS NULL AND session_id IS NOT NULL)
  WITH CHECK (user_id IS NULL);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_activity_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS activity_logs_updated_at ON activity_logs;
CREATE TRIGGER activity_logs_updated_at
  BEFORE UPDATE ON activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_activity_logs_updated_at();

-- ============================================
-- TABLE 2: activity_events (Start/End Timestamps)
-- ============================================
-- INSERT-only event log for tracking when students start/end activities

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

-- RLS Policies for activity_events
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

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE activity_logs IS 'Periodic time tracking - upserts every 10 seconds while student is active';
COMMENT ON COLUMN activity_logs.session_id IS 'Stable ID: browser_session + component_type + component_id + sub_component_id';
COMMENT ON COLUMN activity_logs.total_time_ms IS 'Cumulative time spent on this component in milliseconds';

COMMENT ON TABLE activity_events IS 'INSERT-only event log for tracking attempt start/end timestamps';
COMMENT ON COLUMN activity_events.event_type IS 'attempt_started or attempt_ended';
