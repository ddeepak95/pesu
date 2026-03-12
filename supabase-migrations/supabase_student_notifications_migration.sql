-- Migration: student_notifications table
-- Stores persistent per-student notifications (e.g. "feedback available").
-- Created server-side when a teacher approves feedback.
-- Students can read and mark their own notifications as read.

CREATE TABLE IF NOT EXISTS student_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL DEFAULT 'feedback_available',
  title       text NOT NULL,
  message     text,
  -- { nav_path: string, assignment_title: string }
  -- nav_path is the full pre-computed URL so the frontend never needs extra queries on click.
  data        jsonb NOT NULL DEFAULT '{}',
  read_at     timestamptz DEFAULT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_notifications_student_id_idx
  ON student_notifications (student_id, created_at DESC);

ALTER TABLE student_notifications ENABLE ROW LEVEL SECURITY;

-- Students can only read their own notifications
CREATE POLICY "Students read own notifications"
  ON student_notifications
  FOR SELECT
  USING (auth.uid() = student_id);

-- Students can mark their own notifications as read (update read_at only)
CREATE POLICY "Students update own notifications"
  ON student_notifications
  FOR UPDATE
  USING (auth.uid() = student_id);

-- Server-side API routes (service role) can insert notifications
CREATE POLICY "Service role can insert notifications"
  ON student_notifications
  FOR INSERT
  WITH CHECK (true);
