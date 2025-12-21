-- Make content group-scoped by introducing class_group_id
-- Requires: supabase_class_groups_migration.sql applied first (class_groups exists with group_index=0 per class)

-- 1) content_items
ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS class_group_id UUID REFERENCES class_groups(id) ON DELETE CASCADE;

-- 2) module tables
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS class_group_id UUID REFERENCES class_groups(id) ON DELETE CASCADE;

ALTER TABLE learning_contents
  ADD COLUMN IF NOT EXISTS class_group_id UUID REFERENCES class_groups(id) ON DELETE CASCADE;

ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS class_group_id UUID REFERENCES class_groups(id) ON DELETE CASCADE;

-- Backfill to default group (group_index = 0)
UPDATE content_items ci
SET class_group_id = g.id
FROM class_groups g
WHERE ci.class_group_id IS NULL
  AND g.class_id = ci.class_id
  AND g.group_index = 0;

UPDATE assignments a
SET class_group_id = g.id
FROM class_groups g
WHERE a.class_group_id IS NULL
  AND g.class_id = a.class_id
  AND g.group_index = 0;

UPDATE learning_contents lc
SET class_group_id = g.id
FROM class_groups g
WHERE lc.class_group_id IS NULL
  AND g.class_id = lc.class_id
  AND g.group_index = 0;

UPDATE quizzes q
SET class_group_id = g.id
FROM class_groups g
WHERE q.class_group_id IS NULL
  AND g.class_id = q.class_id
  AND g.group_index = 0;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_content_items_class_group_position
  ON content_items(class_group_id, position);
CREATE INDEX IF NOT EXISTS idx_assignments_class_group_id
  ON assignments(class_group_id);
CREATE INDEX IF NOT EXISTS idx_learning_contents_class_group_id
  ON learning_contents(class_group_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_class_group_id
  ON quizzes(class_group_id);

