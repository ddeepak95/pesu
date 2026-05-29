import "server-only";

import { parseAppFunctionKey } from "@/lib/ai/catalog/appFunctions";
import {
  buildEffectiveCatalogRuntimeState,
  getProviderApiKey,
  resolveCatalogFunctionBinding,
} from "@/lib/ai/catalog/buildEffectiveRuntime";
import { getModelEntry, modelSupportsTasks } from "@/lib/ai/catalog/helpers";
import { PLATFORM_SCOPE_ID } from "@/lib/ai/credentials/constants";
import { getCatalogSecretsForScope } from "@/lib/queries/aiCatalog";
import { createServiceRoleClient } from "@/lib/supabase-server";

import { listImplementedActions } from "./registry";
import type { ActionKind } from "./types";

/**
 * Which multimodal actions can actually run for a class — i.e. the action's
 * content-generation binding (e.g. text.mcq_generation) resolves to an
 * available model, with a provider key, that supports the action's
 * requiredTasks. Used to gate the teacher capability toggles. Mirrors
 * resolveMultimodalSpeechModelsForClass.
 */
export async function resolveAvailableActionKindsForClass(
  classDbId: string,
): Promise<ActionKind[]> {
  const service = createServiceRoleClient();

  const { data: classRow, error: classError } = await service
    .from("classes")
    .select("institution_id")
    .eq("id", classDbId)
    .maybeSingle();
  if (classError) throw classError;
  const institutionId = classRow?.institution_id as string | undefined;

  const [platformSecrets, institutionSecrets, classSecrets] = await Promise.all([
    getCatalogSecretsForScope(service, "platform", PLATFORM_SCOPE_ID),
    institutionId
      ? getCatalogSecretsForScope(service, "institution", institutionId)
      : Promise.resolve(null),
    getCatalogSecretsForScope(service, "class", classDbId),
  ]);

  const runtime = buildEffectiveCatalogRuntimeState(
    platformSecrets,
    institutionSecrets,
    classSecrets,
  );

  const available: ActionKind[] = [];
  for (const action of listImplementedActions()) {
    const { parentKey, subKey } = parseAppFunctionKey(action.appFunctionKey);
    const binding = resolveCatalogFunctionBinding(runtime, parentKey, subKey);
    if (!binding?.modelId) continue;

    const model = getModelEntry(binding.modelId);
    if (!model || model.status !== "available") continue;
    if (!getProviderApiKey(runtime, binding.providerId)) continue;
    if (!modelSupportsTasks(model, action.requiredTasks)) continue;

    available.push(action.kind);
  }
  return available;
}
