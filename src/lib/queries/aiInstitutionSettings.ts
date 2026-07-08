import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiInstitutionPolicy } from "@/types/aiSettings";
import { DEFAULT_AI_INSTITUTION_POLICY } from "@/types/aiSettings";

const POLICY_COLUMNS =
  "institution_id, allow_admin_edit, allow_use_platform_defaults, updated_by, updated_at";

interface AiInstitutionSettingsRow {
  institution_id: string;
  allow_admin_edit: boolean;
  allow_use_platform_defaults: boolean;
}

function rowToPolicy(row: AiInstitutionSettingsRow | null): AiInstitutionPolicy {
  if (!row) return { ...DEFAULT_AI_INSTITUTION_POLICY };
  return {
    allowAdminEdit: row.allow_admin_edit,
    allowUsePlatformDefaults: row.allow_use_platform_defaults ?? true,
  };
}

export async function getInstitutionAiPolicy(
  supabase: SupabaseClient,
  institutionId: string,
): Promise<AiInstitutionPolicy> {
  const { data, error } = await supabase
    .from("ai_institution_settings")
    .select(POLICY_COLUMNS)
    .eq("institution_id", institutionId)
    .maybeSingle();
  if (error) throw error;
  return rowToPolicy((data ?? null) as AiInstitutionSettingsRow | null);
}

export async function setInstitutionAiPolicy(
  supabase: SupabaseClient,
  institutionId: string,
  policy: AiInstitutionPolicy,
  updatedBy: string,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await supabase.from("ai_institution_settings").upsert(
    {
      institution_id: institutionId,
      allow_admin_edit: policy.allowAdminEdit,
      allow_use_platform_defaults: policy.allowUsePlatformDefaults,
      updated_by: updatedBy,
      updated_at: nowIso,
    },
    { onConflict: "institution_id" },
  );
  if (error) throw error;
}

export type InstitutionAiPolicyLockKey =
  | "allow_admin_edit"
  | "allow_use_platform_defaults";

export async function setInstitutionAiPolicyLock(
  supabase: SupabaseClient,
  institutionId: string,
  lock: InstitutionAiPolicyLockKey,
  enabled: boolean,
  updatedBy: string,
  currentPolicy: AiInstitutionPolicy,
): Promise<void> {
  const next: AiInstitutionPolicy = {
    allowAdminEdit: lock === "allow_admin_edit" ? enabled : currentPolicy.allowAdminEdit,
    allowUsePlatformDefaults:
      lock === "allow_use_platform_defaults"
        ? enabled
        : currentPolicy.allowUsePlatformDefaults,
  };
  await setInstitutionAiPolicy(supabase, institutionId, next, updatedBy);
}
