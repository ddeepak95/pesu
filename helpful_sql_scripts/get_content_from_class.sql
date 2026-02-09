-- ============================================================
-- Step 1: DRY RUN (preview rows that will be updated)
-- Step 2: Uncomment the UPDATE block below when ready
-- ============================================================

-- Replace these values:
--   '<YOUR_CLASS_ID>'  → your class text ID (e.g. 'ABC123')
--   ('item1', 'item2') → content_item_ids to exclude/include

-- ── DRY RUN (SELECT) ────────────────────────────────────────
SELECT ci.id, ci.content_item_id, ci.type, ci.lock_after_complete
FROM content_items ci
JOIN classes c ON c.id = ci.class_id
WHERE c.class_id = '<YOUR_CLASS_ID>'
  AND ci.status != 'deleted'
  AND ci.type = 'learning_content'
  -- AND ci.content_item_id NOT IN ('item1', 'item2')   -- exclude specific items
  -- AND ci.content_item_id IN ('item1', 'item2')        -- include only specific items
ORDER BY ci.position;

-- ── UPDATE (uncomment below when ready) ─────────────────────
-- UPDATE content_items ci
-- SET lock_after_complete = true
-- FROM classes c
-- WHERE c.id = ci.class_id
--   AND c.class_id = '<YOUR_CLASS_ID>'
--   AND ci.status != 'deleted'
--   AND ci.type = 'learning_content'
--   -- AND ci.content_item_id NOT IN ('item1', 'item2')   -- exclude specific items
--   -- AND ci.content_item_id IN ('item1', 'item2')        -- include only specific items
-- ;