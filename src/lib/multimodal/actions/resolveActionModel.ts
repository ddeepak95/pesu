import "server-only";

import { resolveMeteredModel, type AiCallContext, type MeteredTextModel } from "@/lib/ai/gateway";
import type { ActionKind } from "./types";
import { getActionDefinition } from "./registry";

/**
 * Resolve an action's content-generation model (Call 2) from its catalog
 * binding (e.g. `text.mcq_generation`) as a metered handle (§7.1). Shared by
 * the turn route and the action-retry endpoint. When `fallback` is provided,
 * a resolution failure degrades to it (the turn route reuses the chat
 * handle); when omitted, the error propagates (the retry endpoint surfaces
 * it as a classified failure). See dev-docs/ai-retry-and-failure-recovery-plan.md §6.
 */
export async function resolveActionModel(input: {
  context: AiCallContext;
  kind: ActionKind;
  fallback?: MeteredTextModel;
}): Promise<MeteredTextModel> {
  try {
    const actionDef = getActionDefinition(input.kind);
    return await resolveMeteredModel({
      appFunctionKey: actionDef.appFunctionKey,
      context: input.context,
    });
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
