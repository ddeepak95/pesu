-- Complete RLS fix for assignments table
-- This drops ALL policies and recreates them from scratch

-- Step 1: Drop ALL existing policies on assignments
DROP POLICY IF EXISTS "Teachers can view their class assignments" ON assignments;
DROP POLICY IF EXISTS "Teachers can create assignments for their classes" ON assignments;
DROP POLICY IF EXISTS "Teachers can update class assignments" ON assignments;
DROP POLICY IF EXISTS "Teachers can delete class assignments" ON assignments;
DROP POLICY IF EXISTS "Anyone can view public assignments" ON assignments;
DROP POLICY IF EXISTS "Students can view class assignments" ON assignments;

-- Step 2: Verify RLS is enabled
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

-- Step 3: Recreate SELECT policy
CREATE POLICY "Teachers can view their class assignments" ON assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = assignments.class_id
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

-- Step 4: Recreate INSERT policy
CREATE POLICY "Teachers can create assignments for their classes" ON assignments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = assignments.class_id
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

-- Step 5: Recreate UPDATE policy - SIMPLIFIED VERSION
-- Using only USING clause (no WITH CHECK) - PostgreSQL will use USING for both if WITH CHECK is omitted
CREATE POLICY "Teachers can update class assignments" ON assignments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = assignments.class_id
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

-- Step 6: Recreate DELETE policy
CREATE POLICY "Teachers can delete class assignments" ON assignments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = assignments.class_id
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

-- Step 7: Verify policies were created
SELECT policyname, cmd, permissive FROM pg_policies WHERE tablename = 'assignments';

