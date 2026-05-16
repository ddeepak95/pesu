-- Institution AI policy (locks). Replaces __locks__ row in ai_capability_configs.
-- Depends on: institutions, is_platform_super_admin, is_institution_admin.

CREATE TABLE IF NOT EXISTS public.ai_institution_settings (
  institution_id uuid PRIMARY KEY REFERENCES public.institutions(id) ON DELETE CASCADE,
  allow_admin_edit boolean NOT NULL DEFAULT false,
  allow_child_override boolean NOT NULL DEFAULT false,
  allow_use_platform_defaults boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_institution_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage all ai institution settings" ON public.ai_institution_settings;
CREATE POLICY "Super admins manage all ai institution settings"
  ON public.ai_institution_settings FOR ALL
  USING (public.is_platform_super_admin())
  WITH CHECK (public.is_platform_super_admin());

DROP POLICY IF EXISTS "Institution admins read ai institution settings" ON public.ai_institution_settings;
CREATE POLICY "Institution admins read ai institution settings"
  ON public.ai_institution_settings FOR SELECT
  USING (public.is_institution_admin(institution_id));

DROP POLICY IF EXISTS "Class co-teachers read ai institution settings" ON public.ai_institution_settings;
CREATE POLICY "Class co-teachers read ai institution settings"
  ON public.ai_institution_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.classes c
      WHERE c.institution_id = ai_institution_settings.institution_id
        AND public.is_class_co_teacher(c.id)
    )
  );

CREATE OR REPLACE FUNCTION public.ai_institution_settings_enforce_super_admin_locks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_platform_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.allow_admin_edit IS DISTINCT FROM OLD.allow_admin_edit THEN
      RAISE EXCEPTION 'Only platform super admins may change allow_admin_edit';
    END IF;
    IF NEW.allow_use_platform_defaults IS DISTINCT FROM OLD.allow_use_platform_defaults THEN
      RAISE EXCEPTION 'Only platform super admins may change allow_use_platform_defaults';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_institution_settings_enforce_super_admin_locks_trg ON public.ai_institution_settings;
CREATE TRIGGER ai_institution_settings_enforce_super_admin_locks_trg
  BEFORE INSERT OR UPDATE ON public.ai_institution_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.ai_institution_settings_enforce_super_admin_locks();
