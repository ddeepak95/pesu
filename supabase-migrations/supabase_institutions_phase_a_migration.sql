-- Migration: Phase A — institutions, institution_members, platform_super_admins,
-- and a nullable classes.institution_id FK + index.
--
-- This is the additive-only schema step from reorg-plan.md §9 Phase A. It does
-- NOT change any existing RLS policies or application behavior. New tables
-- have RLS enabled with NO permissive policies, so they are inaccessible to
-- the anon/authenticated roles until Phase D wires real policies.
--
-- Definition of done (per reorg-plan.md §9 Phase A):
--   * Migration applies cleanly on a fresh DB and on the current production schema.
--   * No regression in existing RLS flows (we touch zero existing policies).
--   * New tables are locked down (RLS on, no policies).
--
-- Rollback (Phase A is reversible — see reorg-plan.md §12):
--   alter table public.classes drop column if exists institution_id;
--   drop table if exists public.institution_members;
--   drop table if exists public.platform_super_admins;
--   drop table if exists public.institutions;

-- =====================================================================
-- 1. institutions
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.institutions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE,
  status text NOT NULL DEFAULT 'active',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT institutions_status_check
    CHECK (status IN ('active', 'suspended', 'archived'))
);

-- At most one default institution row (§7 / §9.B).
CREATE UNIQUE INDEX IF NOT EXISTS institutions_one_default
  ON public.institutions (is_default)
  WHERE is_default = true;

ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
-- No policies in Phase A. Phase D will add super-admin / institution-admin policies.

-- =====================================================================
-- 2. institution_members
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.institution_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  institution_id uuid NOT NULL
    REFERENCES public.institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT institution_members_role_check
    CHECK (role IN ('admin')),
  CONSTRAINT institution_members_unique_membership
    UNIQUE (institution_id, user_id)
);

-- Supports the "list my institutions" lookup from reorg-plan.md §7.
CREATE INDEX IF NOT EXISTS institution_members_user_id_idx
  ON public.institution_members (user_id);

ALTER TABLE public.institution_members ENABLE ROW LEVEL SECURITY;
-- No policies in Phase A.

-- =====================================================================
-- 3. platform_super_admins (allowlist — see reorg-plan.md §8 / §13)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.platform_super_admins (
  user_id uuid PRIMARY KEY
    REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_super_admins ENABLE ROW LEVEL SECURITY;
-- No policies. Managed exclusively via service role / SQL by platform operators
-- so that no end-user (including students) can read or modify the allowlist.

-- =====================================================================
-- 4. classes.institution_id (nullable FK + index)
-- =====================================================================

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS institution_id uuid
    REFERENCES public.institutions(id);

-- Intentionally NULLABLE during Phase A. Backfill is Phase B; the NOT NULL
-- flip is Phase E (reorg-plan.md §9.B and §9.E).

CREATE INDEX IF NOT EXISTS classes_institution_id_idx
  ON public.classes (institution_id);

-- No changes to existing policies on public.classes. Existing
-- owner / co-teacher / student RLS continues to govern access. institution_id
-- is silently NULL on every existing row until Phase B backfill.
