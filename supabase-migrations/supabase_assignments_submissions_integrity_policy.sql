-- Assignment integrity policy (copy/paste, tab switching) and submission access revocation.
-- Run after core assignments/submissions tables exist.

-- Assignments: student-facing integrity settings
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS allow_copy_paste boolean NOT NULL DEFAULT false;

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS tab_switch_policy text NOT NULL DEFAULT 'warn';

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS tab_switch_max_leaves integer NULL;

-- Enforce allowed policy values (PostgreSQL: add constraint if not present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assignments_tab_switch_policy_check'
  ) THEN
    ALTER TABLE assignments
      ADD CONSTRAINT assignments_tab_switch_policy_check
      CHECK (tab_switch_policy IN ('allow', 'warn', 'block_after_threshold'));
  END IF;
END $$;

COMMENT ON COLUMN assignments.allow_copy_paste IS 'When false, answer textareas block paste and clipboard shortcuts.';
COMMENT ON COLUMN assignments.tab_switch_policy IS 'allow: log only; warn: modal on return; block_after_threshold: lock after N leaves.';
COMMENT ON COLUMN assignments.tab_switch_max_leaves IS 'Required when tab_switch_policy = block_after_threshold; max hidden-tab events before lock.';

-- Submissions: teacher-clearable lock after integrity violation
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS integrity_access_revoked_at timestamptz NULL;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS integrity_access_revoked_reason text NULL;

COMMENT ON COLUMN submissions.integrity_access_revoked_at IS 'When set, student cannot continue assessment; APIs return 403.';
COMMENT ON COLUMN submissions.integrity_access_revoked_reason IS 'Machine code e.g. tab_switch_threshold; cleared with revoked_at.';
