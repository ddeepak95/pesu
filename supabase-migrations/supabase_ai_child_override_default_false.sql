-- Default new AI config rows: institution admins cannot edit unless enabled;
-- class admins cannot override unless enabled.

ALTER TABLE public.ai_capability_configs
  ALTER COLUMN allow_admin_edit SET DEFAULT false;

ALTER TABLE public.ai_capability_configs
  ALTER COLUMN allow_child_override SET DEFAULT false;
