-- Migration: Create approved_teachers table
-- This table stores the email addresses of teachers who are allowed to create classes.
-- To approve a teacher, insert their email into this table.

CREATE TABLE IF NOT EXISTS public.approved_teachers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  approved_at timestamp with time zone DEFAULT now()
);

-- RLS: any authenticated user can read (to check own approval)
ALTER TABLE public.approved_teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can check approval"
  ON public.approved_teachers FOR SELECT
  TO authenticated
  USING (true);
