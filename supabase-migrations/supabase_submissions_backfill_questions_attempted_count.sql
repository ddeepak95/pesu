-- 1) Add denormalized column: number of questions with at least one non-stale attempt.
-- Used by teacher submissions table to show "questions attempted / total questions".
ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS questions_attempted_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN submissions.questions_attempted_count IS 'Denormalized: count of question orders that have at least one non-stale attempt in evaluations.';

-- 2) Backfill from existing evaluations JSONB.
-- Counts distinct question keys that have at least one non-stale attempt.
-- Only runs on rows where evaluations is a JSON object (new format).
UPDATE submissions s
SET questions_attempted_count = COALESCE(
  (
    SELECT COUNT(*)::int
    FROM (
      SELECT DISTINCT e.key
      FROM jsonb_each(s.evaluations) AS e(key, val),
           jsonb_array_elements(
             CASE
               WHEN jsonb_typeof(val->'attempts') = 'array'
               THEN val->'attempts'
               ELSE '[]'::jsonb
             END
           ) AS att
      WHERE (att->>'stale') IS DISTINCT FROM 'true'
    ) AS q
  ),
  0
)
WHERE s.evaluations IS NOT NULL
  AND s.evaluations != 'null'::jsonb
  AND jsonb_typeof(s.evaluations) = 'object';
