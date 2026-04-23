-- Activity Events Click Tracking Migration
-- Adds idempotent ingestion support and extends event type taxonomy for
-- semantic click tracking (student-only rollout).
--
-- Changes:
--   1. Add `event_id UUID UNIQUE` column so the API can insert with
--      `on conflict (event_id) do nothing` to prevent duplicate ingestion
--      (retries, React Strict Mode double-fire, etc.).
--   2. Add `client_ts TIMESTAMPTZ` column to record the device time at
--      the moment the event was emitted. Server `created_at` remains the
--      source of truth for ordering; `client_ts` is retained only for
--      latency inspection.
--   3. Document the extended event-type taxonomy. (The `event_type` column
--      is plain TEXT with no CHECK constraint today, so no DB-side
--      whitelist change is required. The API route enforces the whitelist.)

-- 1. event_id for idempotent ingestion
ALTER TABLE activity_events
  ADD COLUMN IF NOT EXISTS event_id UUID;

-- Partial unique index: enforce uniqueness only on rows that have an
-- event_id (legacy rows without one are left untouched).
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_events_event_id_unique
  ON activity_events (event_id)
  WHERE event_id IS NOT NULL;

-- 2. client_ts for latency analysis (nullable; server time is source of truth)
ALTER TABLE activity_events
  ADD COLUMN IF NOT EXISTS client_ts TIMESTAMPTZ;

-- 3. Taxonomy documentation (no constraint change needed)
COMMENT ON COLUMN activity_events.event_id IS
  'Client-generated UUID for idempotent ingestion. Unique when present.';

COMMENT ON COLUMN activity_events.client_ts IS
  'Device time at emit (ISO 8601 UTC) for latency analysis; compatible with created_at arithmetic. Order by created_at instead.';

COMMENT ON COLUMN activity_events.event_type IS
  'Semantic event type. Current allowed values: attempt_started, attempt_ended, '
  'bot_connect_initiated, bot_disconnected, content_item_opened, component_closed, '
  'component_backgrounded, component_foregrounded, navigation_back_clicked, '
  'submit_clicked, question_next_clicked, question_previous_clicked, '
  'upload_started, upload_completed, marked_complete_clicked.';
