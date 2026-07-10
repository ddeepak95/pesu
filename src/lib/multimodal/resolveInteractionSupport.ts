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

export interface MultimodalInteractionSupport {
  /**
   * The class's bound text.chat_tutoring model can accept the learner's audio
   * inline (the `audio_input` ModelTask) — gates the "direct audio input"
   * teacher toggle.
   */
  audioInputSupported: boolean;
  /**
   * The class has a genuinely-usable speech_to_text binding (a real bound model
   * whose status is "available" with a configured provider key). This is the
   * honest signal `resolveMultimodalSpeechModelsForClass` hides behind its
   * default-STT fallback.
   */
  sttSupported: boolean;
  /**
   * Whether learners can use audio input at all: STT can transcribe it, OR the
   * chat model can take it directly. When false, the audio input method must be
   * disabled in teacher config and hidden at runtime.
   */
  audioInputAvailable: boolean;
}

/**
 * Resolve all audio-input-related capabilities for a class in a single runtime
 * build. Direct-audio and STT are two independent ways to accept learner audio;
 * `audioInputAvailable` is their OR. See
 * dev-docs/multimodal-interaction-config-plan.md §3g and this feature's plan.
 */
export async function resolveInteractionSupportForClass(
  classDbId: string,
): Promise<MultimodalInteractionSupport> {
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

  // Direct audio input: chat model declares the `audio_input` task.
  const { parentKey, subKey } = parseAppFunctionKey("text.chat_tutoring");
  const chatBinding = resolveCatalogFunctionBinding(runtime, parentKey, subKey);
  let audioInputSupported = false;
  if (chatBinding?.modelId) {
    const chatModel = getModelEntry(chatBinding.modelId);
    if (
      chatModel &&
      chatModel.status === "available" &&
      getProviderApiKey(runtime, chatBinding.providerId)
    ) {
      audioInputSupported = modelSupportsTasks(chatModel, ["audio_input"]);
    }
  }

  // STT: a genuinely-usable speech_to_text binding (mirrors the pre-fallback
  // condition in resolveMultimodalSpeechModelsForClass).
  const sttBinding = resolveCatalogFunctionBinding(runtime, "speech_to_text");
  let sttSupported = false;
  if (sttBinding?.modelId) {
    const sttModel = getModelEntry(sttBinding.modelId);
    sttSupported = Boolean(
      sttModel &&
        sttModel.status === "available" &&
        getProviderApiKey(runtime, sttBinding.providerId),
    );
  }

  return {
    audioInputSupported,
    sttSupported,
    audioInputAvailable: sttSupported || audioInputSupported,
  };
}
