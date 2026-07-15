import "server-only";

import type { AppFunctionKey } from "@/lib/ai/catalog/appFunctions";
import type { ResolvedModelConfig } from "@/lib/ai/config";
import type { TokenDetails } from "@/lib/ai/metering/computeUsage";
import type { UsageType } from "@/lib/ai/metering/usageTypes";
import type { AiConfigSource } from "@/types/aiSettings";

export interface AiInvocationModelMeta {
  provider: string;
  modelId: string;
  keySource: AiConfigSource;
}

/** How a billable metric's value was obtained (§5.1). */
export type MetricSource = "provider" | "measured" | "estimated";

export interface AiInvocationDomainContext {
  appFunctionKey: AppFunctionKey;
  /** Defaults to 'text_generation' (the ai_invocations column default) when omitted. */
  usageType?: UsageType;
  classId?: string | null;
  assignmentId?: string | null;
  submissionId?: string | null;
  questionOrder?: number | null;
  questionId?: string | null;
  attemptNumber?: number | null;
  attemptId?: string | null;
  sessionId?: string | null;
  /** Acting user (request auth context) — §4.1. */
  userId?: string | null;
  /** Links this invocation to a domain row (e.g. a chat_message_action id) — §5.3. */
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
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

/** Non-token billable metrics — populated by the modality that produced them (§4.1, §5.0). */
export interface AiInvocationBillableMetrics {
  audioMs?: number | null;
  characters?: number | null;
  audioOutputMs?: number | null;
  sessionMs?: number | null;
  metricSource?: MetricSource | null;
  tokenDetails?: TokenDetails | null;
  providerRequestId?: string | null;
  /** Token-billed STT providers only (currently OpenAI) — see RawUsageMetrics in computeUsage.ts. */
  sttAudioInputTokens?: number | null;
  sttOutputTokens?: number | null;
}

export interface CompleteAiInvocationInput extends AiInvocationBillableMetrics {
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
