-- Auto-create groups on class creation + student assignment strategy
-- Depends on: supabase_class_groups_migration.sql (ensure_class_groups, assign_student_to_group)

-- =====================================================
-- 1. Trigger: auto-create groups when a class is inserted
-- =====================================================
CREATE OR REPLACE FUNCTION trg_classes_ensure_groups()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM ensure_class_groups(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS classes_ensure_groups ON classes;
CREATE TRIGGER classes_ensure_groups
  AFTER INSERT ON classes
  FOR EACH ROW
  EXECUTE FUNCTION trg_classes_ensure_groups();

-- =====================================================
-- 2. Add student_assignment_strategy column to classes
-- =====================================================
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS student_assignment_strategy TEXT NOT NULL DEFAULT 'round_robin';

-- Add CHECK constraint (idempotent: drop first if exists)
DO $$
BEGIN
  ALTER TABLE classes DROP CONSTRAINT IF EXISTS chk_student_assignment_strategy;
  ALTER TABLE classes ADD CONSTRAINT chk_student_assignment_strategy
    CHECK (student_assignment_strategy IN ('round_robin', 'default_group'));
END;
$$;

COMMENT ON COLUMN classes.student_assignment_strategy IS
  'How new students are assigned to groups: round_robin (balanced distribution) or default_group (all go to Group 1)';

-- =====================================================
-- 3. Update assign_student_to_group to respect strategy
-- =====================================================
CREATE OR REPLACE FUNCTION assign_student_to_group(p_class_id UUID, p_student_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group_id UUID;
  v_strategy TEXT;
BEGIN
  -- Ensure groups exist
  PERFORM ensure_class_groups(p_class_id);

  -- Read the assignment strategy for this class
  SELECT student_assignment_strategy INTO v_strategy
  FROM classes
  WHERE id = p_class_id;

  IF v_strategy = 'default_group' THEN
    -- Assign to the first group (group_index = 0)
    SELECT g.id INTO v_group_id
    FROM class_groups g
    WHERE g.class_id = p_class_id AND g.group_index = 0
    LIMIT 1;
  ELSE
    -- Round-robin: pick group with lowest membership count, then lowest index
    SELECT g.id
    INTO v_group_id
    FROM class_groups g
    LEFT JOIN class_group_memberships m
      ON m.group_id = g.id
    WHERE g.class_id = p_class_id
    GROUP BY g.id, g.group_index
    ORDER BY COUNT(m.id) ASC, g.group_index ASC
    LIMIT 1;
  END IF;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'No groups available for class';
  END IF;

  INSERT INTO class_group_memberships (class_id, group_id, student_id)
  VALUES (p_class_id, v_group_id, p_student_id)
  ON CONFLICT (class_id, student_id) DO NOTHING;
END;
$$;
