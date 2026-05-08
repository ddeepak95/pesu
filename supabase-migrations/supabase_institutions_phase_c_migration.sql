-- Migration: Phase C — server-enforced dual-write of classes.institution_id and
-- super-admin move-class RPC with audit trail.
--
-- Depends on:
--   * supabase_institutions_phase_a_migration.sql (institutions, institution_members,
--     platform_super_admins, classes.institution_id column).
--   * supabase_institutions_phase_b_migration.sql (default institution row exists,
--     all classes have non-NULL institution_id).
--
-- This migration:
--   * Adds public.default_institution_id() helper.
--   * Adds a BEFORE INSERT trigger on public.classes that fills institution_id
--     with the default when NULL. Never overrides an explicit value, so the
--     future institution-admin path (passing institution_id from session) and
--     the move RPC's UPDATE both work unchanged.
--   * Adds public.class_institution_moves audit table (RLS on, no policies in
--     Phase C — Phase D adds super-admin SELECT/INSERT).
--   * Adds public.move_class_to_institution(class_id, target_institution_id, reason)
--     SECURITY DEFINER RPC that verifies platform_super_admins membership,
--     updates classes.institution_id, writes the audit row, and returns the
--     audit row id (null on no-op when target == current).
--
-- Behavior unchanged for end users (solo teachers, students). Existing RLS
-- policies on public.classes still gate access. NOT NULL flip on
-- classes.institution_id is Phase E.
--
-- Service-role tooling: can skip this RPC and UPDATE classes.institution_id
-- directly; service role bypasses RLS and SECURITY DEFINER auth checks.
-- The audit row will not be written in that case (intentional — service-role
-- moves should be logged out-of-band).
--
-- Rollback:
--   drop function if exists public.move_class_to_institution(uuid, uuid, text);
--   drop table if exists public.class_institution_moves;
--   drop trigger if exists set_class_default_institution_trg on public.classes;
--   drop function if exists public.set_class_default_institution();
--   drop function if exists public.default_institution_id();

-- =====================================================================
-- 1. Helper: default institution lookup
-- =====================================================================

CREATE OR REPLACE FUNCTION public.default_institution_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.institutions WHERE is_default = true LIMIT 1;
$$;

-- =====================================================================
-- 2. BEFORE INSERT trigger on public.classes
-- =====================================================================

CREATE OR REPLACE FUNCTION public.set_class_default_institution()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.institution_id IS NULL THEN
    NEW.institution_id := public.default_institution_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_class_default_institution_trg ON public.classes;
CREATE TRIGGER set_class_default_institution_trg
  BEFORE INSERT ON public.classes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_class_default_institution();

-- =====================================================================
-- 3. Audit table public.class_institution_moves
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.class_institution_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  from_institution_id uuid NOT NULL REFERENCES public.institutions(id),
  to_institution_id uuid NOT NULL REFERENCES public.institutions(id),
  moved_by uuid NOT NULL REFERENCES auth.users(id),
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS class_institution_moves_class_id_idx
  ON public.class_institution_moves (class_id);
CREATE INDEX IF NOT EXISTS class_institution_moves_created_at_idx
  ON public.class_institution_moves (created_at DESC);

ALTER TABLE public.class_institution_moves ENABLE ROW LEVEL SECURITY;
-- No policies in Phase C. The SECURITY DEFINER RPC below writes rows; reads
-- are blocked until Phase D adds super-admin SELECT.

-- =====================================================================
-- 4. move_class_to_institution RPC (super-admin only)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.move_class_to_institution(
  p_class_id uuid,
  p_target_institution_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_from uuid;
  v_audit_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'move_class_to_institution: no authenticated user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.platform_super_admins WHERE user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'move_class_to_institution: caller is not a platform super admin';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.institutions WHERE id = p_target_institution_id
  ) THEN
    RAISE EXCEPTION
      'move_class_to_institution: target institution % does not exist',
      p_target_institution_id;
  END IF;

  SELECT institution_id INTO v_from
    FROM public.classes
    WHERE id = p_class_id;

  IF v_from IS NULL THEN
    RAISE EXCEPTION
      'move_class_to_institution: class % not found or has no institution_id',
      p_class_id;
  END IF;

  IF v_from = p_target_institution_id THEN
    -- Already there; treat as no-op so callers can retry safely.
    RETURN NULL;
  END IF;

  UPDATE public.classes
    SET institution_id = p_target_institution_id,
        updated_at = now()
    WHERE id = p_class_id;

  INSERT INTO public.class_institution_moves
    (class_id, from_institution_id, to_institution_id, moved_by, reason)
  VALUES
    (p_class_id, v_from, p_target_institution_id, v_caller, p_reason)
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.move_class_to_institution(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_class_to_institution(uuid, uuid, text) TO authenticated;
