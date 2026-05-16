import "server-only";

import type { AppFunctionKey } from "@/lib/ai/catalog/appFunctions";
import { resolveCatalogModelConfigForPlatform } from "@/lib/ai/catalog/resolveRuntime";
import type { ResolvedModelConfig } from "@/lib/ai/config";
import { getCachedResolveModelConfig } from "@/lib/ai/credentials/modelConfigCache";
import { AiNotConfiguredError } from "@/lib/ai/credentials/resolve";

/**
 * Resolve catalog model config for a class, or platform scope when no class is given.
 * Throws AiNotConfiguredError when catalog is not configured (no env fallback).
 */
export async function resolveCatalogConfigForRequest(input: {
  classDbId?: string | null;
  appFunctionKey: AppFunctionKey;
}): Promise<ResolvedModelConfig> {
  if (input.classDbId) {
    const resolved = await getCachedResolveModelConfig({
      classDbId: input.classDbId,
      appFunctionKey: input.appFunctionKey,
    });
    return resolved.config;
  }

  const resolved = await resolveCatalogModelConfigForPlatform(
    input.appFunctionKey,
  );
  return resolved.config;
}

export function catalogNotConfiguredResponse(error: unknown) {
  if (error instanceof AiNotConfiguredError) {
    return {
      body: { error: error.message, code: error.code },
      status: 503 as const,
    };
  }
  return null;
}
