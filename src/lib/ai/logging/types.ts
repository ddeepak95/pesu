import "server-only";

import type { AppFunctionKey } from "@/lib/ai/catalog/appFunctions";
import type { ResolvedModelConfig } from "@/lib/ai/config";
import type { AiConfigSource } from "@/types/aiSettings";

export interface AiInvocationModelMeta {
  provider: string;
  modelId: string;
  keySource: AiConfigSource;
}

export interface AiInvocationDomainContext {
  appFunctionKey: AppFunctionKey;
  classId?: string | null;
  assignmentId?: string | null;
  submissionId?: string | null;
  questionOrder?: number | null;
  attemptNumber?: number | null;
}

export interface StartAiInvocationInput extends AiInvocationDomainContext {
  model: AiInvocationModelMeta;
  sdkRequest: unknown;
  retryOf?: string | null;
  retryIndex?: number;
}

export interface AiInvocationUsage {
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
}

export interface CompleteAiInvocationInput {
  sdkResponse: unknown;
  usage?: AiInvocationUsage | null;
  finishReason?: string | null;
}

export function modelMetaFromResolved(
  config: ResolvedModelConfig,
  keySource: AiConfigSource,
): AiInvocationModelMeta {
  return {
    provider: config.provider,
    modelId: config.modelId,
    keySource,
  };
}
