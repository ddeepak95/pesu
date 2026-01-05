-- Diagnostic queries to understand why assignments RLS is failing
-- Run these in Supabase SQL Editor and share the results

-- 1. Check all RLS policies on assignments table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'assignments'
ORDER BY policyname;

-- 2. Check if RLS is enabled on assignments
SELECT 
  tablename,
  rowsecurity
FROM pg_tables 
WHERE tablename = 'assignments';

-- 3. Check triggers on assignments table
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'assignments';

-- 4. Check table structure (especially constraints)
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'assignments'
ORDER BY ordinal_position;

-- 5. Check table constraints (CHECK constraints especially)
SELECT 
  tc.constraint_name,
  tc.constraint_type,
  cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc 
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'assignments'
  AND tc.constraint_type IN ('CHECK', 'FOREIGN KEY');

-- 6. Get a sample assignment to check its structure
-- Replace the assignment id with the one you're trying to delete
SELECT 
  id,
  assignment_id,
  class_id,
  status,
  created_by,
  updated_at
FROM assignments 
WHERE id = 'b02fec08-3e67-4a4f-9dc3-ce88ec3e2ed9';

-- 7. Check if the class exists and who created it
SELECT 
  c.id,
  c.created_by as class_owner,
  EXISTS (
    SELECT 1 FROM class_teachers ct
    WHERE ct.class_id = c.id
    AND ct.teacher_id = auth.uid()
  ) as is_co_teacher,
  auth.uid() as current_user_id
FROM classes c
WHERE c.id = (
  SELECT class_id FROM assignments WHERE id = 'b02fec08-3e67-4a4f-9dc3-ce88ec3e2ed9'
);

-- 8. Check class_teachers relationship
SELECT 
  ct.class_id,
  ct.teacher_id,
  ct.created_at
FROM class_teachers ct
WHERE ct.class_id = (
  SELECT class_id FROM assignments WHERE id = 'b02fec08-3e67-4a4f-9dc3-ce88ec3e2ed9'
);

