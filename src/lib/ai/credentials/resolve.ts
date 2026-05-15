import "server-only";

import type { ResolvedModelConfig } from "@/lib/ai/config";
import { getDefaultModelConfigFromEnv } from "@/lib/ai/config";
import {
  getAiCapabilityDefinition,
  TEXT_CAPABILITY_KEY,
  type AiCapabilityKey,
  type AiProvider,
} from "@/lib/ai/capabilities/registry";
import { buildClassAiConfigs } from "@/lib/ai/credentials/buildEffective";
import { decryptApiKey } from "@/lib/ai/credentials/crypto";
import { PLATFORM_SCOPE_ID } from "@/lib/ai/credentials/constants";
import {
  listAiConfigMetaForScope,
  listAiConfigSecretsForScope,
} from "@/lib/queries/aiCapabilityConfigs";
import { createServiceRoleClient } from "@/lib/supabase-server";
import type {
  AiCapabilityConfigSecretRow,
  EffectiveAiCapabilityMeta,
} from "@/types/aiCapabilityConfig";
import { isAiConfigLocksKey } from "@/lib/ai/credentials/constants";

function rowToResolvedConfig(row: AiCapabilityConfigSecretRow): ResolvedModelConfig {
  if (!row.provider || !row.encrypted_api_key) {
    throw new Error("AI config row is missing provider or encrypted key");
  }
  const provider = row.provider as AiProvider;
  const def = getAiCapabilityDefinition(row.capability_key as AiCapabilityKey);
  const modelId =
    row.model_id?.trim() ||
    def.modelPlaceholders[provider] ||
    getDefaultModelConfigFromEnv().modelId;

  return {
    provider,
    apiKey: decryptApiKey(row.encrypted_api_key),
    modelId,
  };
}

function findSecretRowForMeta(
  meta: EffectiveAiCapabilityMeta,
  platformSecrets: AiCapabilityConfigSecretRow[],
  instSecrets: AiCapabilityConfigSecretRow[],
  classSecrets: AiCapabilityConfigSecretRow[],
): AiCapabilityConfigSecretRow | null {
  const key = meta.capabilityKey;
  if (meta.source === "class") {
    return (
      classSecrets.find(
        (r) => r.capability_key === key && !r.use_platform_default,
      ) ?? null
    );
  }
  if (meta.source === "institution") {
    return (
      instSecrets.find(
        (r) => r.capability_key === key && !r.use_platform_default,
      ) ?? null
    );
  }
  if (meta.source === "platform") {
    return (
      platformSecrets.find(
        (r) => r.capability_key === key && !r.use_platform_default,
      ) ?? null
    );
  }
  return null;
}

/**
 * Resolve provider + model + decrypted API key for a class.
 * Defaults to the text capability (all text LLM routes).
 * Phase 2 consumer — not called from API routes in Phase 1.
 */
export async function resolveModelConfig(input: {
  classDbId: string;
  capabilityKey?: AiCapabilityKey;
}): Promise<ResolvedModelConfig> {
  const capabilityKey = input.capabilityKey ?? TEXT_CAPABILITY_KEY;
  const meta = await resolveModelConfigMeta({
    classDbId: input.classDbId,
    capabilityKey,
  });
  if (meta.source === "env" || meta.source === "unconfigured") {
    return getDefaultModelConfigFromEnv();
  }

  const service = createServiceRoleClient();
  const { data: classRow, error: classErr } = await service
    .from("classes")
    .select("institution_id")
    .eq("id", input.classDbId)
    .maybeSingle();
  if (classErr) throw classErr;
  const institutionId = classRow?.institution_id as string | undefined;

  const [platformSecrets, instSecrets, classSecrets] = await Promise.all([
    listAiConfigSecretsForScope(service, "platform", PLATFORM_SCOPE_ID),
    institutionId
      ? listAiConfigSecretsForScope(service, "institution", institutionId)
      : Promise.resolve<AiCapabilityConfigSecretRow[]>([]),
    listAiConfigSecretsForScope(service, "class", input.classDbId),
  ]);

  const row = findSecretRowForMeta(
    meta,
    platformSecrets.filter((r) => !isAiConfigLocksKey(r.capability_key)),
    instSecrets.filter((r) => !isAiConfigLocksKey(r.capability_key)),
    classSecrets.filter((r) => !isAiConfigLocksKey(r.capability_key)),
  );

  if (!row) {
    return getDefaultModelConfigFromEnv();
  }
  return rowToResolvedConfig(row);
}

/** Effective metadata without decrypting keys. */
export async function resolveModelConfigMeta(input: {
  classDbId: string;
  capabilityKey?: AiCapabilityKey;
}): Promise<EffectiveAiCapabilityMeta> {
  const capabilityKey = input.capabilityKey ?? TEXT_CAPABILITY_KEY;
  const service = createServiceRoleClient();
  const { data: classRow, error: classErr } = await service
    .from("classes")
    .select("institution_id")
    .eq("id", input.classDbId)
    .maybeSingle();
  if (classErr) throw classErr;
  const institutionId = classRow?.institution_id as string | undefined;

  const [platformRows, instRows, classRows] = await Promise.all([
    listAiConfigMetaForScope(service, "platform", PLATFORM_SCOPE_ID),
    institutionId
      ? listAiConfigMetaForScope(service, "institution", institutionId)
      : Promise.resolve([]),
    listAiConfigMetaForScope(service, "class", input.classDbId),
  ]);

  const bundle = buildClassAiConfigs(platformRows, instRows, classRows);
  return bundle.capabilities[capabilityKey];
}
