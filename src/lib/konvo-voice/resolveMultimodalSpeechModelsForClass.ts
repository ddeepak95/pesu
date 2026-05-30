import "server-only";

import { DEFAULT_KONVO_SESSION_CONFIG } from "@/components/Shared/KonvoVoice/defaultSessionConfig";
import { PLATFORM_SCOPE_ID } from "@/lib/ai/credentials/constants";
import { buildEffectiveCatalogRuntimeState, getProviderApiKey, resolveCatalogFunctionBinding } from "@/lib/ai/catalog/buildEffectiveRuntime";
import { getCatalogSecretsForScope } from "@/lib/queries/aiCatalog";
import { getModelEntry } from "@/lib/ai/catalog/helpers";
import { createServiceRoleClient } from "@/lib/supabase-server";

export interface ResolvedMultimodalSpeechModels {
  sttModelId: string;
  ttsModelId: string;
}

export async function resolveMultimodalSpeechModelsForAssignment(
  assignmentId: string,
): Promise<ResolvedMultimodalSpeechModels | null> {
  const service = createServiceRoleClient();
  const { data: assignment, error: assignmentError } = await service
    .from("assignments")
    .select("class_id")
    .eq("assignment_id", assignmentId)
    .maybeSingle();
  if (assignmentError) throw assignmentError;
  const classDbId = assignment?.class_id as string | undefined;
  if (!classDbId) return null;

  return resolveMultimodalSpeechModelsForClass(classDbId);
}

export async function resolveMultimodalSpeechModelsForClass(
  classDbId: string,
): Promise<ResolvedMultimodalSpeechModels> {
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

  const sttBinding = resolveCatalogFunctionBinding(runtime, "speech_to_text");
  const ttsBinding = resolveCatalogFunctionBinding(runtime, "text_to_speech");

  const sttModel = sttBinding?.modelId ? getModelEntry(sttBinding.modelId) : null;
  const ttsModel = ttsBinding?.modelId ? getModelEntry(ttsBinding.modelId) : null;
  const sttProviderKey = sttBinding?.providerId
    ? getProviderApiKey(runtime, sttBinding.providerId)
    : null;
  const ttsProviderKey = ttsBinding?.providerId
    ? getProviderApiKey(runtime, ttsBinding.providerId)
    : null;

  const sttModelId =
    sttBinding?.modelId &&
    sttModel &&
    sttModel.status === "available" &&
    Boolean(sttProviderKey)
      ? sttBinding.modelId
      : DEFAULT_KONVO_SESSION_CONFIG.sttModelId;

  const ttsModelId =
    ttsBinding?.modelId &&
    ttsModel &&
    ttsModel.status === "available" &&
    Boolean(ttsProviderKey)
      ? ttsBinding.modelId
      : DEFAULT_KONVO_SESSION_CONFIG.ttsModelId;

  return {
    sttModelId,
    ttsModelId,
  };
}

export function getDefaultMultimodalSpeechModels(): ResolvedMultimodalSpeechModels {
  return {
    sttModelId: DEFAULT_KONVO_SESSION_CONFIG.sttModelId,
    ttsModelId: DEFAULT_KONVO_SESSION_CONFIG.ttsModelId,
  };
}
