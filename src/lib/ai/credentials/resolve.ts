import "server-only";

import type { AppFunctionKey } from "@/lib/ai/catalog/appFunctions";
import { resolveCatalogModelConfigForClass } from "@/lib/ai/catalog/resolveRuntime";
import type { ResolvedModelConfig } from "@/lib/ai/config";
import { getDefaultModelConfigFromEnv } from "@/lib/ai/config";
import {
  AI_NOT_CONFIGURED_ERROR_CODE,
} from "@/lib/ai/credentials/constants";
import { createServiceRoleClient } from "@/lib/supabase-server";
import type { AiConfigSource } from "@/types/aiSettings";

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

async function loadInstitutionIdForClass(
  classDbId: string,
): Promise<string | undefined> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("classes")
    .select("institution_id")
    .eq("id", classDbId)
    .maybeSingle();
  if (error) throw error;
  return data?.institution_id as string | undefined;
}

/**
 * Resolve provider + model + decrypted API key for a class via the AI catalog.
 */
export async function resolveModelConfig(input: {
  classDbId: string;
  appFunctionKey: AppFunctionKey;
}): Promise<ResolveModelConfigResult> {
  const institutionId = await loadInstitutionIdForClass(input.classDbId);
  return resolveCatalogModelConfigForClass({
    classDbId: input.classDbId,
    institutionId,
    appFunctionKey: input.appFunctionKey,
  });
}

/** Env-based fallback when no class context exists (e.g. evaluate without assignment). */
export function resolveEnvModelConfig(): ResolveModelConfigResult {
  return {
    config: getDefaultModelConfigFromEnv(),
    keySource: "env",
  };
}
