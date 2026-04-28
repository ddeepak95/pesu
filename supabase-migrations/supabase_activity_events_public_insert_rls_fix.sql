-- Ensure activity_events insert RLS works for both authenticated and public flows.
-- This is safe to run multiple times.

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

-- Recreate insert policies to avoid drift across environments.
DROP POLICY IF EXISTS "Students can insert own activity events" ON activity_events;
DROP POLICY IF EXISTS "Allow anonymous activity event inserts" ON activity_events;

CREATE POLICY "Students can insert own activity events"
  ON activity_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Allow anonymous activity event inserts"
  ON activity_events
  FOR INSERT
  WITH CHECK (user_id IS NULL);
