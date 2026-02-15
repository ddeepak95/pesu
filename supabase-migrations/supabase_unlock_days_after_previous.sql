-- Unlock Days After Previous Migration
-- Allows teachers to gate content items behind a minimum wait period after
-- completing the previous item. E.g. item B unlocks 4 days after item A is complete.

ALTER TABLE public.content_items
ADD COLUMN IF NOT EXISTS unlock_days_after_previous INTEGER NULL;

COMMENT ON COLUMN content_items.unlock_days_after_previous IS
  'If set, this item unlocks only after this many calendar days since the previous item was completed. Null or 0 = no delay.';
