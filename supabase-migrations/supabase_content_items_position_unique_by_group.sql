-- Stabilize content ordering per group by enforcing unique positions.
-- Requires: `class_group_id` column exists on content_items (run group-scoped content migration first).

-- 1) Normalize existing positions per group for active/draft items.
-- This prevents duplicate positions from causing unstable ordering.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY class_group_id
      ORDER BY position ASC, created_at ASC, id ASC
    ) - 1 AS new_position
  FROM content_items
  WHERE class_group_id IS NOT NULL
    AND status IN ('active', 'draft')
)
UPDATE content_items ci
SET position = ranked.new_position,
    updated_at = timezone('utc'::text, now())
FROM ranked
WHERE ci.id = ranked.id
  AND ci.position <> ranked.new_position;

-- 2) Enforce uniqueness of position within a group for active/draft items.
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_items_unique_group_position_active
  ON content_items(class_group_id, position)
  WHERE class_group_id IS NOT NULL
    AND status IN ('active', 'draft');




