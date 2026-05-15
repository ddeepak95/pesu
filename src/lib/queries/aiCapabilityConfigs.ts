import type { SupabaseClient } from "@supabase/supabase-js";

import { PLATFORM_SCOPE_ID, type AiConfigScope } from "@/lib/ai/credentials/constants";
import {
  buildClassAiConfigs,
  buildInstitutionAiConfigs,
  buildPlatformAiConfigs,
} from "@/lib/ai/credentials/buildEffective";
import {
  asAiCapabilityKey,
  TEXT_CAPABILITY_KEY,
} from "@/lib/ai/capabilities/registry";
import type {
  AiCapabilityConfigMetaRow,
  AiCapabilityConfigSecretRow,
  AiInstitutionPolicy,
  EffectiveAiConfigs,
  UpsertAiConfigPayload,
} from "@/types/aiCapabilityConfig";
import type { AiProvider } from "@/lib/ai/capabilities/registry";
import { AI_CONFIG_LOCKS_KEY } from "@/lib/ai/credentials/constants";

const META_COLUMNS =
  "scope, scope_id, capability_key, use_platform_default, provider, model_id, key_hint, allow_admin_edit, allow_child_override, allow_use_platform_defaults, updated_by, updated_at";

const SECRET_COLUMNS = `${META_COLUMNS}, encrypted_api_key`;

export async function listAiConfigMetaForScope(
  supabase: SupabaseClient,
  scope: AiConfigScope,
  scopeId: string,
): Promise<AiCapabilityConfigMetaRow[]> {
  const { data, error } = await supabase
    .from("ai_capability_configs_meta")
    .select(META_COLUMNS)
    .eq("scope", scope)
    .eq("scope_id", scopeId);
  if (error) throw error;
  return (data ?? []) as AiCapabilityConfigMetaRow[];
}

export async function listAiConfigSecretsForScope(
  supabase: SupabaseClient,
  scope: AiConfigScope,
  scopeId: string,
): Promise<AiCapabilityConfigSecretRow[]> {
  const { data, error } = await supabase
    .from("ai_capability_configs")
    .select(SECRET_COLUMNS)
    .eq("scope", scope)
    .eq("scope_id", scopeId);
  if (error) throw error;
  return (data ?? []) as AiCapabilityConfigSecretRow[];
}

export async function getPlatformAiConfigs(
  supabase: SupabaseClient,
): Promise<EffectiveAiConfigs> {
  const rows = await listAiConfigMetaForScope(
    supabase,
    "platform",
    PLATFORM_SCOPE_ID,
  );
  return buildPlatformAiConfigs(rows);
}

export async function getInstitutionAiConfigs(
  supabase: SupabaseClient,
  institutionId: string,
): Promise<EffectiveAiConfigs> {
  const [platformRows, instRows] = await Promise.all([
    listAiConfigMetaForScope(supabase, "platform", PLATFORM_SCOPE_ID),
    listAiConfigMetaForScope(supabase, "institution", institutionId),
  ]);
  return buildInstitutionAiConfigs(platformRows, instRows);
}

export async function getClassAiConfigs(
  supabase: SupabaseClient,
  classDbId: string,
): Promise<EffectiveAiConfigs> {
  const { data: classRow, error: classErr } = await supabase
    .from("classes")
    .select("institution_id")
    .eq("id", classDbId)
    .maybeSingle();
  if (classErr) throw classErr;
  const institutionId = classRow?.institution_id as string | undefined;

  const [platformRows, instRows, classRows] = await Promise.all([
    listAiConfigMetaForScope(supabase, "platform", PLATFORM_SCOPE_ID),
    institutionId
      ? listAiConfigMetaForScope(supabase, "institution", institutionId)
      : Promise.resolve<AiCapabilityConfigMetaRow[]>([]),
    listAiConfigMetaForScope(supabase, "class", classDbId),
  ]);

  return buildClassAiConfigs(platformRows, instRows, classRows);
}

export interface UpsertAiConfigForScopeArgs {
  scope: AiConfigScope;
  scopeId: string;
  capabilityKey: string;
  updatedBy: string;
  usePlatformDefault: boolean;
  provider: AiProvider | null;
  modelId: string | null;
  encryptedApiKey: string | null;
  keyHint: string | null;
}

export async function upsertAiConfigForScope(
  supabase: SupabaseClient,
  args: UpsertAiConfigForScopeArgs,
): Promise<void> {
  asAiCapabilityKey(args.capabilityKey);
  const { error } = await supabase.from("ai_capability_configs").upsert(
    {
      scope: args.scope,
      scope_id: args.scopeId,
      capability_key: args.capabilityKey,
      use_platform_default: args.usePlatformDefault,
      provider: args.provider,
      model_id: args.modelId,
      encrypted_api_key: args.encryptedApiKey,
      key_hint: args.keyHint,
      updated_by: args.updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "scope,scope_id,capability_key" },
  );
  if (error) throw error;
}

export async function clearAiConfigForScope(
  supabase: SupabaseClient,
  scope: AiConfigScope,
  scopeId: string,
  capabilityKey: string,
): Promise<void> {
  asAiCapabilityKey(capabilityKey);
  const { error } = await supabase
    .from("ai_capability_configs")
    .delete()
    .eq("scope", scope)
    .eq("scope_id", scopeId)
    .eq("capability_key", capabilityKey);
  if (error) throw error;
}

export async function setInstitutionAiConfigLocks(
  supabase: SupabaseClient,
  institutionId: string,
  policy: AiInstitutionPolicy,
  updatedBy: string,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await supabase.from("ai_capability_configs").upsert(
    {
      scope: "institution",
      scope_id: institutionId,
      capability_key: AI_CONFIG_LOCKS_KEY,
      use_platform_default: true,
      provider: null,
      model_id: null,
      encrypted_api_key: null,
      key_hint: null,
      allow_admin_edit: policy.allowAdminEdit,
      allow_child_override: policy.allowChildOverride,
      allow_use_platform_defaults: policy.allowUsePlatformDefaults,
      updated_by: updatedBy,
      updated_at: nowIso,
    },
    { onConflict: "scope,scope_id,capability_key" },
  );
  if (error) throw error;
}

export type InstitutionAiConfigLockKey =
  | "allow_admin_edit"
  | "allow_child_override"
  | "allow_use_platform_defaults";

export async function setInstitutionAiConfigLock(
  supabase: SupabaseClient,
  institutionId: string,
  lock: InstitutionAiConfigLockKey,
  enabled: boolean,
  updatedBy: string,
  currentPolicy: AiInstitutionPolicy,
): Promise<void> {
  const next: AiInstitutionPolicy = {
    allowAdminEdit:
      lock === "allow_admin_edit" ? enabled : currentPolicy.allowAdminEdit,
    allowChildOverride:
      lock === "allow_child_override"
        ? enabled
        : currentPolicy.allowChildOverride,
    allowUsePlatformDefaults:
      lock === "allow_use_platform_defaults"
        ? enabled
        : currentPolicy.allowUsePlatformDefaults,
  };
  await setInstitutionAiConfigLocks(supabase, institutionId, next, updatedBy);
}

/** Build upsert args from payload + optional existing ciphertext. */
export function buildUpsertArgsFromPayload(
  scope: AiConfigScope,
  scopeId: string,
  capabilityKey: string,
  updatedBy: string,
  payload: UpsertAiConfigPayload,
  existing: {
    encryptedApiKey: string | null;
    keyHint: string | null;
  } | null,
  encryptedKey: { ciphertext: string; hint: string } | null,
): UpsertAiConfigForScopeArgs {
  if (payload.usePlatformDefault) {
    return {
      scope,
      scopeId,
      capabilityKey,
      updatedBy,
      usePlatformDefault: true,
      provider: null,
      modelId: null,
      encryptedApiKey: null,
      keyHint: null,
    };
  }

  const provider = payload.provider!;
  const modelId = payload.modelId?.trim() || null;
  const enc = encryptedKey ?? {
    ciphertext: existing?.encryptedApiKey ?? null,
    hint: existing?.keyHint ?? null,
  };

  if (!enc.ciphertext) {
    throw new Error("API key is required for custom configuration");
  }

  return {
    scope,
    scopeId,
    capabilityKey,
    updatedBy,
    usePlatformDefault: false,
    provider,
    modelId,
    encryptedApiKey: enc.ciphertext,
    keyHint: enc.hint,
  };
}

export { TEXT_CAPABILITY_KEY };
