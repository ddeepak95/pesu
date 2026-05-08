-- Migration: Phase B — seed the default institution and backfill classes.institution_id.
--
-- Depends on: supabase_institutions_phase_a_migration.sql (institutions table,
-- institutions_one_default partial unique index, classes.institution_id column).
--
-- This migration is idempotent: a second run is a no-op (no duplicate default
-- row, no churn on classes.updated_at). It still does NOT change app behavior:
--   * institution_id remains NULLABLE (NOT NULL flip is Phase E).
--   * Existing RLS policies are untouched (Phase D rewrites them).
--   * No app code reads institution_id yet (Phase C wires dual-write).
--
-- Definition of done (per reorg-plan.md §9 Phase B):
--   * Exactly one is_default = true institution row exists.
--   * select count(*) from public.classes where institution_id is null = 0.
--   * Re-running the migration is a no-op.
--
-- Rollback (still rollback-friendly per reorg-plan.md §12):
--   update public.classes set institution_id = null
--     where institution_id = (select id from public.institutions where is_default = true);
--   delete from public.institutions where is_default = true;

-- =====================================================================
-- 1. Seed the default institution (idempotent on slug)
-- =====================================================================

INSERT INTO public.institutions (name, slug, status, is_default)
VALUES ('Default Workspace', 'default', 'active', true)
ON CONFLICT (slug) DO NOTHING;

-- The Phase A institutions_one_default partial unique index guarantees that
-- at most one row can have is_default = true, so even a manually-inserted
-- default with a different slug would cause this insert to fail loudly --
-- which is the desired behavior (operator must reconcile before continuing).

-- =====================================================================
-- 2. Backfill classes.institution_id
-- =====================================================================

WITH default_inst AS (
  SELECT id FROM public.institutions WHERE is_default = true LIMIT 1
)
UPDATE public.classes
SET
  institution_id = (SELECT id FROM default_inst),
  updated_at = updated_at  -- explicit no-op so we don't bump audit timestamps
WHERE institution_id IS NULL;

-- =====================================================================
-- 3. Invariant checks (fail fast if anything is wrong)
-- =====================================================================

DO $$
DECLARE
  v_default_count int;
  v_null_classes int;
BEGIN
  SELECT count(*) INTO v_default_count
    FROM public.institutions
    WHERE is_default = true;
  IF v_default_count <> 1 THEN
    RAISE EXCEPTION
      'Phase B invariant violated: expected exactly 1 default institution, found %',
      v_default_count;
  END IF;

  SELECT count(*) INTO v_null_classes
    FROM public.classes
    WHERE institution_id IS NULL;
  IF v_null_classes <> 0 THEN
    RAISE EXCEPTION
      'Phase B invariant violated: % classes still have NULL institution_id',
      v_null_classes;
  END IF;
END
$$;
