-- Class groups + student enrollment + group membership
-- Assumes existing tables:
-- - classes(id uuid pk, class_id text, created_by uuid, ...)
-- - class_teachers(class_id uuid fk -> classes.id, teacher_id uuid, role text, ...)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper: Check if current user is a student enrolled in a class (bypasses RLS)
CREATE OR REPLACE FUNCTION is_class_student(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_students 
    WHERE class_id = p_class_id 
    AND student_id = auth.uid()
  );
$$;

-- Add group_count to classes
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS group_count INTEGER NOT NULL DEFAULT 1 CHECK (group_count >= 1);

-- Groups within a class
CREATE TABLE IF NOT EXISTS class_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  group_index INTEGER NOT NULL CHECK (group_index >= 0),
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (class_id, group_index)
);

CREATE INDEX IF NOT EXISTS idx_class_groups_class_id ON class_groups(class_id);

-- Students enrolled in a class (auth.users uid)
CREATE TABLE IF NOT EXISTS class_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (class_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_class_students_class_id ON class_students(class_id);
CREATE INDEX IF NOT EXISTS idx_class_students_student_id ON class_students(student_id);

-- Membership linking student -> group (one per class)
CREATE TABLE IF NOT EXISTS class_group_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (class_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_class_group_memberships_class_id ON class_group_memberships(class_id);
CREATE INDEX IF NOT EXISTS idx_class_group_memberships_group_id ON class_group_memberships(group_id);
CREATE INDEX IF NOT EXISTS idx_class_group_memberships_student_id ON class_group_memberships(student_id);

-- updated_at trigger function (shared)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_class_groups_updated_at ON class_groups;
CREATE TRIGGER update_class_groups_updated_at
  BEFORE UPDATE ON class_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Ensure baseline groups exist for a class (0..group_count-1)
CREATE OR REPLACE FUNCTION ensure_class_groups(p_class_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group_count INTEGER;
  i INTEGER;
BEGIN
  SELECT group_count INTO v_group_count FROM classes WHERE id = p_class_id;
  IF v_group_count IS NULL THEN
    RAISE EXCEPTION 'Class not found';
  END IF;

  FOR i IN 0..(v_group_count - 1) LOOP
    INSERT INTO class_groups (class_id, group_index, name)
    VALUES (p_class_id, i, 'Group ' || (i + 1))
    ON CONFLICT (class_id, group_index) DO NOTHING;
  END LOOP;
END;
$$;

-- Assign a student to a group (round-robin-ish: lowest membership count, then lowest group_index)
CREATE OR REPLACE FUNCTION assign_student_to_group(p_class_id UUID, p_student_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group_id UUID;
BEGIN
  PERFORM ensure_class_groups(p_class_id);

  SELECT g.id
  INTO v_group_id
  FROM class_groups g
  LEFT JOIN class_group_memberships m
    ON m.group_id = g.id
  WHERE g.class_id = p_class_id
  GROUP BY g.id, g.group_index
  ORDER BY COUNT(m.id) ASC, g.group_index ASC
  LIMIT 1;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'No groups available for class';
  END IF;

  INSERT INTO class_group_memberships (class_id, group_id, student_id)
  VALUES (p_class_id, v_group_id, p_student_id)
  ON CONFLICT (class_id, student_id) DO NOTHING;
END;
$$;

-- Trigger: whenever a student joins a class, assign them to a group
CREATE OR REPLACE FUNCTION trg_class_students_assign_group()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM assign_student_to_group(NEW.class_id, NEW.student_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS class_students_assign_group ON class_students;
CREATE TRIGGER class_students_assign_group
  AFTER INSERT ON class_students
  FOR EACH ROW
  EXECUTE FUNCTION trg_class_students_assign_group();

-- Reconfigure groups (owner-only): preserve memberships for groups that remain.
-- When shrinking, move students from removed groups into remaining groups in a balanced way.
CREATE OR REPLACE FUNCTION reconfigure_class_groups(p_class_id UUID, p_new_group_count INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner UUID;
  v_old_group_count INTEGER;
  i INTEGER;
  v_group RECORD;
  v_student RECORD;
BEGIN
  IF p_new_group_count < 1 THEN
    RAISE EXCEPTION 'group_count must be >= 1';
  END IF;

  SELECT created_by, group_count INTO v_owner, v_old_group_count
  FROM classes
  WHERE id = p_class_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Class not found';
  END IF;
  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Only class owner can change group count';
  END IF;

  IF p_new_group_count = v_old_group_count THEN
    RETURN;
  END IF;

  -- Increasing: create missing groups
  IF p_new_group_count > v_old_group_count THEN
    UPDATE classes SET group_count = p_new_group_count WHERE id = p_class_id;
    PERFORM ensure_class_groups(p_class_id);
    RETURN;
  END IF;

  -- Shrinking: move members from groups >= new_count into remaining groups
  FOR v_group IN
    SELECT id, group_index FROM class_groups
    WHERE class_id = p_class_id
      AND group_index >= p_new_group_count
    ORDER BY group_index ASC
  LOOP
    FOR v_student IN
      SELECT m.student_id
      FROM class_group_memberships m
      WHERE m.class_id = p_class_id
        AND m.group_id = v_group.id
      ORDER BY m.assigned_at ASC
    LOOP
      -- Temporarily delete membership and reassign into remaining groups (balanced)
      DELETE FROM class_group_memberships
      WHERE class_id = p_class_id AND student_id = v_student.student_id;

      PERFORM assign_student_to_group(p_class_id, v_student.student_id);
    END LOOP;

    -- Now safe to delete the group (no memberships remain)
    DELETE FROM class_groups WHERE id = v_group.id;
  END LOOP;

  UPDATE classes SET group_count = p_new_group_count WHERE id = p_class_id;
  PERFORM ensure_class_groups(p_class_id);
END;
$$;

-- Backfill: ensure every existing class has at least Group 1
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN SELECT id FROM classes LOOP
    PERFORM ensure_class_groups(c.id);
  END LOOP;
END;
$$;

-- RLS
ALTER TABLE class_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_group_memberships ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Teachers can view class groups" ON class_groups;
DROP POLICY IF EXISTS "Owner can manage class groups" ON class_groups;
DROP POLICY IF EXISTS "Student can join class" ON class_students;
DROP POLICY IF EXISTS "Student can view their enrollment" ON class_students;
DROP POLICY IF EXISTS "Teachers can view class students" ON class_students;
DROP POLICY IF EXISTS "Student can view their membership" ON class_group_memberships;
DROP POLICY IF EXISTS "Teachers can view class memberships" ON class_group_memberships;

-- Teachers (owner or co-teacher) can view groups and memberships
CREATE POLICY "Teachers can view class groups" ON class_groups
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = class_groups.class_id
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

-- Owner-only group management
CREATE POLICY "Owner can manage class groups" ON class_groups
  FOR ALL
  USING (EXISTS (SELECT 1 FROM classes WHERE classes.id = class_groups.class_id AND classes.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM classes WHERE classes.id = class_groups.class_id AND classes.created_by = auth.uid()));

-- Students can join a class by inserting their own row; teachers can view.
CREATE POLICY "Student can join class" ON class_students
  FOR INSERT
  WITH CHECK (auth.uid() = student_id);

-- Students can view their own enrollment records
CREATE POLICY "Student can view their enrollment" ON class_students
  FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view class students" ON class_students
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = class_students.class_id
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

CREATE POLICY "Student can view their membership" ON class_group_memberships
  FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view class memberships" ON class_group_memberships
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = class_group_memberships.class_id
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

-- =====================================================
-- PART 3: Update classes table RLS to allow students
-- =====================================================

-- Policy: Students can view classes they're enrolled in
-- Uses helper function to avoid circular RLS dependency
DROP POLICY IF EXISTS "Students can view their classes" ON classes;
CREATE POLICY "Students can view their classes" ON classes
  FOR SELECT
  USING (is_class_student(id));


