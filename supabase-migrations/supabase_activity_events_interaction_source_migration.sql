-- Adds interaction_source classification to activity_events for clearer analytics.
-- Values used by app: click | lifecycle | async_callback | system

ALTER TABLE activity_events
  ADD COLUMN IF NOT EXISTS interaction_source TEXT;

CREATE INDEX IF NOT EXISTS idx_activity_events_interaction_source
  ON activity_events (interaction_source);

COMMENT ON COLUMN activity_events.interaction_source IS
  'Source classifier for event trigger semantics: click, lifecycle, async_callback, or system.';

