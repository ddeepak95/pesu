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

/**
 * Whether the class's currently-bound text.chat_tutoring model supports direct
 * audio input (the `audio_input` ModelTask). Gates the "direct audio input"
 * teacher toggle. Mirrors resolveAvailableActionKindsForClass.
 * See dev-docs/multimodal-interaction-config-plan.md §3g.
 */
export async function resolveAudioInputSupportForClass(
  classDbId: string,
): Promise<boolean> {
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

  const { parentKey, subKey } = parseAppFunctionKey("text.chat_tutoring");
  const binding = resolveCatalogFunctionBinding(runtime, parentKey, subKey);
  if (!binding?.modelId) return false;

  const model = getModelEntry(binding.modelId);
  if (!model || model.status !== "available") return false;
  if (!getProviderApiKey(runtime, binding.providerId)) return false;

  return modelSupportsTasks(model, ["audio_input"]);
}
