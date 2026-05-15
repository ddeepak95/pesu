import "server-only";

import type { ResolvedModelConfig } from "@/lib/ai/config";
import { getDefaultModelConfigFromEnv } from "@/lib/ai/config";
import {
  getAiCapabilityDefinition,
  TEXT_CAPABILITY_KEY,
  type AiCapabilityKey,
  resolveAiProvider,
  resolveGoogleModelId,
} from "@/lib/ai/capabilities/registry";
import { buildClassAiConfigs } from "@/lib/ai/credentials/buildEffective";
import { decryptApiKey } from "@/lib/ai/credentials/crypto";
import {
  AI_NOT_CONFIGURED_ERROR_CODE,
  PLATFORM_SCOPE_ID,
  type AiConfigScope,
} from "@/lib/ai/credentials/constants";
import {
  getAiConfigSecretForCapability,
  listAiConfigMetaForScope,
} from "@/lib/queries/aiCapabilityConfigs";
import { createServiceRoleClient } from "@/lib/supabase-server";
import type {
  AiCapabilityConfigSecretRow,
  AiConfigSource,
  EffectiveAiCapabilityMeta,
} from "@/types/aiCapabilityConfig";

export interface ResolveModelConfigResult {
  config: ResolvedModelConfig;
  keySource: AiConfigSource;
}

/** Log-friendly label: platform defaults vs institution/class custom keys. */
export function aiKeySourceLogLabel(source: AiConfigSource): "platform" | "custom" {
  if (source === "institution" || source === "class") return "custom";
  return "platform";
}

export class AiNotConfiguredError extends Error {
  readonly code = AI_NOT_CONFIGURED_ERROR_CODE;

  constructor(message = "AI is not configured for this class.") {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

function rowToResolvedConfig(
  row: AiCapabilityConfigSecretRow,
): ResolvedModelConfig {
  if (!row.provider || !row.encrypted_api_key) {
    throw new Error("AI config row is missing provider or encrypted key");
  }
  const def = getAiCapabilityDefinition(row.capability_key as AiCapabilityKey);
  const modelId = resolveGoogleModelId(row.model_id, def.defaultModelId);

  return {
    provider: resolveAiProvider(row.provider),
    apiKey: decryptApiKey(row.encrypted_api_key),
    modelId,
  };
}

function winningScopeForMeta(
  meta: EffectiveAiCapabilityMeta,
  classDbId: string,
  institutionId: string | undefined,
): { scope: AiConfigScope; scopeId: string } | null {
  if (meta.source === "class") {
    return { scope: "class", scopeId: classDbId };
  }
  if (meta.source === "institution") {
    if (!institutionId) return null;
    return { scope: "institution", scopeId: institutionId };
  }
  if (meta.source === "platform") {
    return { scope: "platform", scopeId: PLATFORM_SCOPE_ID };
  }
  return null;
}

export interface ClassAiConfigContext {
  meta: EffectiveAiCapabilityMeta;
  institutionId: string | undefined;
}

export async function loadClassAiConfigContext(input: {
  classDbId: string;
  capabilityKey?: AiCapabilityKey;
}): Promise<ClassAiConfigContext> {
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
  return {
    meta: bundle.capabilities[capabilityKey],
    institutionId,
  };
}

export async function resolveModelConfigFromContext(
  classDbId: string,
  capabilityKey: AiCapabilityKey,
  ctx: ClassAiConfigContext,
): Promise<ResolveModelConfigResult> {
  const { meta, institutionId } = ctx;

  if (meta.source === "unconfigured") {
    throw new AiNotConfiguredError();
  }

  if (meta.source === "env") {
    return {
      config: getDefaultModelConfigFromEnv(),
      keySource: "env",
    };
  }

  const winning = winningScopeForMeta(meta, classDbId, institutionId);
  if (!winning) {
    throw new AiNotConfiguredError();
  }

  const service = createServiceRoleClient();
  const row = await getAiConfigSecretForCapability(
    service,
    winning.scope,
    winning.scopeId,
    capabilityKey,
  );

  if (!row?.encrypted_api_key) {
    throw new AiNotConfiguredError();
  }

  return {
    config: rowToResolvedConfig(row),
    keySource: meta.source,
  };
}

/**
 * Resolve provider + model + decrypted API key for a class.
 * Defaults to the text capability (all text LLM routes).
 */
export async function resolveModelConfig(input: {
  classDbId: string;
  capabilityKey?: AiCapabilityKey;
}): Promise<ResolveModelConfigResult> {
  const capabilityKey = input.capabilityKey ?? TEXT_CAPABILITY_KEY;
  const ctx = await loadClassAiConfigContext({
    classDbId: input.classDbId,
    capabilityKey,
  });
  return resolveModelConfigFromContext(input.classDbId, capabilityKey, ctx);
}

/** Effective metadata without decrypting keys. */
export async function resolveModelConfigMeta(input: {
  classDbId: string;
  capabilityKey?: AiCapabilityKey;
}): Promise<EffectiveAiCapabilityMeta> {
  const capabilityKey = input.capabilityKey ?? TEXT_CAPABILITY_KEY;
  const { meta } = await loadClassAiConfigContext({
    classDbId: input.classDbId,
    capabilityKey,
  });
  return meta;
}
