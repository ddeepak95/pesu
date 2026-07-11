import "server-only";

import type { LanguageModelV3, SharedV3ProviderOptions } from "@ai-sdk/provider";

import { getCachedResolveModelConfig } from "@/lib/ai/credentials/modelConfigCache";
import { getLanguageModel } from "@/lib/ai/provider";
import { providerOptionsForConfig } from "@/lib/ai/providerOptions";
import type { ActionKind } from "./types";
import { getActionDefinition } from "./registry";

export interface ResolvedActionModel {
  model: LanguageModelV3;
  providerOptions?: SharedV3ProviderOptions;
}

/**
 * Resolve an action's content-generation model (Call 2) from its catalog
 * binding (e.g. `text.mcq_generation`). Shared by the turn route and the
 * action-retry endpoint. When `fallback` is provided, a resolution failure
 * degrades to it (the turn route reuses the chat model); when omitted, the
 * error propagates (the retry endpoint surfaces it as a classified failure).
 * See dev-docs/ai-retry-and-failure-recovery-plan.md §6.
 */
export async function resolveActionModel(input: {
  classDbId: string;
  kind: ActionKind;
  fallback?: ResolvedActionModel;
}): Promise<ResolvedActionModel> {
  try {
    const actionDef = getActionDefinition(input.kind);
    const resolved = await getCachedResolveModelConfig({
      classDbId: input.classDbId,
      appFunctionKey: actionDef.appFunctionKey,
    });
    return {
      model: getLanguageModel(resolved.config),
      providerOptions: providerOptionsForConfig(resolved.config),
    };
  } catch (err) {
    if (input.fallback) {
      console.error(
        "[resolveActionModel] Failed to resolve action model; using fallback:",
        err,
      );
      return input.fallback;
    }
    throw err;
  }
}
