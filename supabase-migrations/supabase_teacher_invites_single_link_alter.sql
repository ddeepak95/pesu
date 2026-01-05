-- Upgrade script: convert teacher invites to single reusable link per class (unlimited joins)
-- Use if you previously applied an older teacher-invites migration.

-- 1) Make max_uses nullable (NULL => unlimited)
ALTER TABLE class_teacher_invites
  ALTER COLUMN max_uses DROP NOT NULL;

-- Drop old check if it exists (name may vary; ignore errors if not present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'class_teacher_invites_max_uses_check'
  ) THEN
    ALTER TABLE class_teacher_invites DROP CONSTRAINT class_teacher_invites_max_uses_check;
  END IF;
END;
$$;

-- 2) Enforce one invite per class
CREATE UNIQUE INDEX IF NOT EXISTS idx_class_teacher_invites_unique_class_id
  ON class_teacher_invites(class_id);

-- 3) Update functions (recreate from latest migration file)
-- Note: easiest is to re-run the function definitions from `supabase_teacher_invites_migration.sql`.




