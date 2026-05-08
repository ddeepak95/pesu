-- Hard reset activity_events RLS policies to a known-good state.
-- Useful when environments drift and contain stale/restrictive policies.

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activity_events'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.activity_events',
      policy_record.policyname
    );
  END LOOP;
END
$$;

CREATE POLICY "Students can insert own activity events"
  ON public.activity_events
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Allow anonymous activity event inserts"
  ON public.activity_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (user_id IS NULL);

CREATE POLICY "Students can view own activity events"
  ON public.activity_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Teachers can view class activity events"
  ON public.activity_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.class_teachers ct
      WHERE ct.class_id = activity_events.class_id
        AND ct.teacher_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.classes c
      WHERE c.id = activity_events.class_id
        AND c.created_by = auth.uid()
    )
  );
