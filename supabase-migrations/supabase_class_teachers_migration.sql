-- Migration: Create class_teachers table with RLS policies
-- This table stores co-teachers for classes (owner is in classes.created_by)
-- Also updates classes table RLS to allow co-teachers to view classes
--
-- IMPORTANT: Uses SECURITY DEFINER helper functions to avoid circular RLS dependencies

-- =====================================================
-- PART 0: Helper functions (SECURITY DEFINER to bypass RLS)
-- =====================================================

-- Helper: Check if current user is the owner of a class (bypasses RLS)
CREATE OR REPLACE FUNCTION is_class_owner(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM classes 
    WHERE id = p_class_id 
    AND created_by = auth.uid()
  );
$$;

-- Helper: Check if current user is a co-teacher of a class (bypasses RLS)
CREATE OR REPLACE FUNCTION is_class_co_teacher(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_teachers 
    WHERE class_id = p_class_id 
    AND teacher_id = auth.uid()
  );
$$;

-- =====================================================
-- PART 1: class_teachers table
-- =====================================================

-- Create the class_teachers table if it doesn't exist
CREATE TABLE IF NOT EXISTS class_teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'co-teacher' CHECK (role IN ('co-teacher')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (class_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS idx_class_teachers_class_id ON class_teachers(class_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_teacher_id ON class_teachers(teacher_id);

-- Enable RLS
ALTER TABLE class_teachers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Teachers can view their own class_teachers entries" ON class_teachers;
DROP POLICY IF EXISTS "Owners can view all class teachers" ON class_teachers;
DROP POLICY IF EXISTS "Owners can delete class teachers" ON class_teachers;

-- Policy: Teachers can view their own class_teachers entries
-- This is essential for the getClassesByUser query to work for co-teachers
CREATE POLICY "Teachers can view their own class_teachers entries" ON class_teachers
  FOR SELECT
  USING (teacher_id = auth.uid());

-- Policy: Class owners can view all teachers in their classes
-- Uses helper function to avoid circular RLS dependency
CREATE POLICY "Owners can view all class teachers" ON class_teachers
  FOR SELECT
  USING (is_class_owner(class_id));

-- Policy: Class owners can remove co-teachers from their classes
CREATE POLICY "Owners can delete class teachers" ON class_teachers
  FOR DELETE
  USING (is_class_owner(class_id));

-- Note: INSERT is handled by the accept_teacher_invite function which uses SECURITY DEFINER

-- =====================================================
-- PART 2: Update classes table RLS policies
-- =====================================================

-- Enable RLS on classes (if not already enabled)
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Owners can view their classes" ON classes;
DROP POLICY IF EXISTS "Owners can manage their classes" ON classes;
DROP POLICY IF EXISTS "Co-teachers can view their classes" ON classes;

-- Policy: Owners can view classes they created
CREATE POLICY "Owners can view their classes" ON classes
  FOR SELECT
  USING (created_by = auth.uid());

-- Policy: Owners can insert/update/delete classes they created
CREATE POLICY "Owners can manage their classes" ON classes
  FOR ALL
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Policy: Co-teachers can view classes they're added to
-- Uses helper function to avoid circular RLS dependency
CREATE POLICY "Co-teachers can view their classes" ON classes
  FOR SELECT
  USING (is_class_co_teacher(id));

