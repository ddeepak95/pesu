-- Repair migration for activity_events idempotent ingestion.
-- Fixes `ON CONFLICT (event_id)` errors when a partial index exists.

-- 1) Remove duplicate non-null event IDs (keep the oldest row by created_at, then id).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY event_id
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM activity_events
  WHERE event_id IS NOT NULL
)
DELETE FROM activity_events ae
USING ranked r
WHERE ae.id = r.id
  AND r.rn > 1;

-- 2) Drop any existing index with this name (partial or full).
DROP INDEX IF EXISTS idx_activity_events_event_id_unique;

-- 3) Create full unique index so `ON CONFLICT (event_id)` is valid.
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_events_event_id_unique
  ON activity_events (event_id);

