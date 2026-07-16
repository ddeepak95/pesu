-- Class-level AI access kill switch — mirrors
-- ai_institution_settings.allow_use_platform_defaults but at class grain.
-- Unlike that column (config-time only, checked by
-- ai_provider_activations_enforce_institution_policy on activation
-- writes), this one is additionally enforced live at AI-call time by the
-- gateway (src/lib/ai/metering/access.ts), so flipping it off actually
-- stops calls immediately instead of only blocking future provider
-- activations. See dev-docs/ai-usage-metering-phase4-plan.md decision 1
-- (revised 2026-07-15 after UI mock review).
--
-- Default true (fail-open) — matches allow_use_platform_defaults' default
-- and every existing class's current, unrestricted behavior; nothing
-- changes until an admin explicitly turns a class off.
alter table public.ai_class_settings
  add column if not exists ai_access_enabled boolean not null default true;

-- No new RLS needed — the existing "Institution admins manage ai class
-- settings" / "Super admins manage all ai class settings" policies on
-- ai_class_settings already permit UPDATE on the whole row, this column
-- included.
