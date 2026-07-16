import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiInstitutionPolicy } from "@/types/aiSettings";
import { DEFAULT_AI_INSTITUTION_POLICY } from "@/types/aiSettings";

const POLICY_COLUMNS =
  "institution_id, allow_admin_edit_providers, allow_admin_edit_functions, allow_use_platform_defaults, default_allow_child_override_providers, default_allow_child_override_functions, updated_by, updated_at";

interface AiInstitutionSettingsRow {
  institution_id: string;
  allow_admin_edit_providers: boolean;
  allow_admin_edit_functions: boolean;
  allow_use_platform_defaults: boolean;
  default_allow_child_override_providers: boolean;
  default_allow_child_override_functions: boolean;
}

function rowToPolicy(row: AiInstitutionSettingsRow | null): AiInstitutionPolicy {
  if (!row) return { ...DEFAULT_AI_INSTITUTION_POLICY };
  return {
    allowAdminEditProviders: row.allow_admin_edit_providers,
    allowAdminEditFunctions: row.allow_admin_edit_functions,
    allowUsePlatformDefaults: row.allow_use_platform_defaults ?? true,
    defaultAllowChildOverrideProviders: row.default_allow_child_override_providers,
    defaultAllowChildOverrideFunctions: row.default_allow_child_override_functions,
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
      allow_admin_edit_providers: policy.allowAdminEditProviders,
      allow_admin_edit_functions: policy.allowAdminEditFunctions,
      allow_use_platform_defaults: policy.allowUsePlatformDefaults,
      default_allow_child_override_providers: policy.defaultAllowChildOverrideProviders,
      default_allow_child_override_functions: policy.defaultAllowChildOverrideFunctions,
      updated_by: updatedBy,
      updated_at: nowIso,
    },
    { onConflict: "institution_id" },
  );
  if (error) throw error;
}

export type InstitutionAiPolicyLockKey =
  | "allow_admin_edit_providers"
  | "allow_admin_edit_functions"
  | "allow_use_platform_defaults"
  | "default_allow_child_override_providers"
  | "default_allow_child_override_functions";

export async function setInstitutionAiPolicyLock(
  supabase: SupabaseClient,
  institutionId: string,
  lock: InstitutionAiPolicyLockKey,
  enabled: boolean,
  updatedBy: string,
  currentPolicy: AiInstitutionPolicy,
): Promise<void> {
  const next: AiInstitutionPolicy = {
    allowAdminEditProviders:
      lock === "allow_admin_edit_providers"
        ? enabled
        : currentPolicy.allowAdminEditProviders,
    allowAdminEditFunctions:
      lock === "allow_admin_edit_functions"
        ? enabled
        : currentPolicy.allowAdminEditFunctions,
    allowUsePlatformDefaults:
      lock === "allow_use_platform_defaults"
        ? enabled
        : currentPolicy.allowUsePlatformDefaults,
    defaultAllowChildOverrideProviders:
      lock === "default_allow_child_override_providers"
        ? enabled
        : currentPolicy.defaultAllowChildOverrideProviders,
    defaultAllowChildOverrideFunctions:
      lock === "default_allow_child_override_functions"
        ? enabled
        : currentPolicy.defaultAllowChildOverrideFunctions,
  };
  await setInstitutionAiPolicy(supabase, institutionId, next, updatedBy);
}
