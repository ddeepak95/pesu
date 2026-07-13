import "server-only";

import { computeUsage, type TokenDetails } from "@/lib/ai/metering/computeUsage";
import { CURRENT_RATE_VERSION } from "@/lib/ai/metering/rates";
import type { UsageType } from "@/lib/ai/metering/usageTypes";
import { logAppEvent, resolveInstitutionId } from "@/lib/logging/appLog";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { isAiInvocationLoggingEnabled } from "./enabled";
import { uploadInvocationJson } from "./gcs";
import { aiInvocationStoragePaths } from "./paths";
import type {
  AiInvocationDomainContext,
  AiInvocationModelMeta,
  CompleteAiInvocationInput,
  StartAiInvocationInput,
} from "./types";

function contextPayload(ctx: AiInvocationDomainContext) {
  return {
    classId: ctx.classId ?? null,
    assignmentId: ctx.assignmentId ?? null,
    submissionId: ctx.submissionId ?? null,
    questionOrder: ctx.questionOrder ?? null,
    attemptNumber: ctx.attemptNumber ?? null,
  };
}

function modelPayload(model: AiInvocationModelMeta) {
  return {
    provider: model.provider,
    modelId: model.modelId,
    keySource: model.keySource,
  };
}

function logInvocationError(label: string, err: unknown) {
  console.error(`[ai-invocation] ${label}:`, err);
}

/** Shape of the `ai` package's `LanguageModelUsage` that we actually read. */
type SdkUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputTokenDetails?: { cacheReadTokens?: number };
  outputTokenDetails?: { reasoningTokens?: number };
  /** @deprecated superseded by inputTokenDetails.cacheReadTokens; kept as a fallback. */
  cachedInputTokens?: number;
  /** @deprecated superseded by outputTokenDetails.reasoningTokens; kept as a fallback. */
  reasoningTokens?: number;
};

function usageFromSdk(usage: SdkUsage | undefined | null) {
  if (!usage) return null;
  return {
    promptTokens: usage.inputTokens ?? null,
    completionTokens: usage.outputTokens ?? null,
    totalTokens: usage.totalTokens ?? null,
  };
}

/**
 * Pulls the cached/reasoning token breakdown out of the SDK's usage object
 * (dev-docs/ai-usage-metering-plan.md §4.1, §5.2) — this is what lets
 * computeUsage price cached input at the rate card's `cached_input_token`
 * discount instead of the full `input_token` rate.
 */
function tokenDetailsFromSdk(usage: SdkUsage | undefined | null): TokenDetails | null {
  if (!usage) return null;
  const cachedInputTokens =
    usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens ?? undefined;
  const reasoningTokens =
    usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens ?? undefined;
  if (cachedInputTokens == null && reasoningTokens == null) return null;
  return {
    ...(cachedInputTokens != null ? { cachedInputTokens } : {}),
    ...(reasoningTokens != null ? { reasoningTokens } : {}),
  };
}

export function usageFromAiSdkResult(result: {
  usage?: PromiseLike<SdkUsage>;
}): Promise<CompleteAiInvocationInput["usage"]> {
  if (!result.usage) return Promise.resolve(null);
  return Promise.resolve(result.usage).then((u) => usageFromSdk(u));
}

export function tokenDetailsFromAiSdkResult(result: {
  usage?: PromiseLike<SdkUsage>;
}): Promise<TokenDetails | null> {
  if (!result.usage) return Promise.resolve(null);
  return Promise.resolve(result.usage).then((u) => tokenDetailsFromSdk(u));
}

/** Direct (non-promise) usage — for callers like generateText whose usage is already resolved. */
export function tokenDetailsFromSdkUsage(usage: SdkUsage | undefined | null): TokenDetails | null {
  return tokenDetailsFromSdk(usage);
}

function usageFromLoggedSdkResponse(
  sdkResponse: unknown,
): CompleteAiInvocationInput["usage"] {
  if (!sdkResponse || typeof sdkResponse !== "object") return null;
  const usage = (sdkResponse as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object") return null;
  return usageFromSdk(usage as SdkUsage);
}

function tokenDetailsFromLoggedSdkResponse(sdkResponse: unknown): TokenDetails | null {
  if (!sdkResponse || typeof sdkResponse !== "object") return null;
  const usage = (sdkResponse as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object") return null;
  return tokenDetailsFromSdk(usage as SdkUsage);
}

/**
 * Detached, fire-and-forget GCS payload upload — debug/audit only (§6). Never
 * awaited by the row lifecycle; a storage outage costs only the debug
 * payload, never a billing row. Paths are set on the row only when capture
 * is enabled (isAiInvocationLoggingEnabled), which is what makes the
 * previously-NOT-NULL request_storage_path legal to leave null otherwise.
 */
function scheduleInvocationPayloadUpload(
  invocationId: string,
  storagePath: string,
  payload: unknown,
): void {
  void uploadInvocationJson(storagePath, payload).catch((err) =>
    logInvocationError(`failed to upload payload for ${invocationId}`, err),
  );
}

async function persistAiInvocationStart(
  input: StartAiInvocationInput,
  invocationId: string,
): Promise<void> {
  const service = createServiceRoleClient();
  const captureEnabled = isAiInvocationLoggingEnabled();
  const paths = captureEnabled ? aiInvocationStoragePaths(invocationId) : null;

  const institutionId = input.classId
    ? await resolveInstitutionId(service, input.classId)
    : null;

  // The row is always written — it's the system of record for billing/usage,
  // independent of whether GCS debug-payload capture is enabled (§6).
  const { error: insertError } = await service.from("ai_invocations").insert({
    id: invocationId,
    app_function_key: input.appFunctionKey,
    usage_type: input.usageType ?? "text_generation",
    ai_provider: input.model.provider,
    ai_model_id: input.model.modelId,
    ai_key_source: input.model.keySource,
    class_id: input.classId ?? null,
    institution_id: institutionId,
    user_id: input.userId ?? null,
    assignment_id: input.assignmentId ?? null,
    submission_id: input.submissionId ?? null,
    question_order: input.questionOrder ?? null,
    attempt_number: input.attemptNumber ?? null,
    related_entity_type: input.relatedEntityType ?? null,
    related_entity_id: input.relatedEntityId ?? null,
    request_storage_path: paths?.requestStoragePath ?? null,
    response_storage_path: null,
    retry_of: input.retryOf ?? null,
    retry_index: input.retryIndex ?? 0,
    status: "pending",
  });

  if (insertError) {
    throw insertError;
  }

  if (paths) {
    scheduleInvocationPayloadUpload(invocationId, paths.requestStoragePath, {
      invocationId,
      appFunctionKey: input.appFunctionKey,
      recordedAt: new Date().toISOString(),
      context: contextPayload(input),
      model: modelPayload(input.model),
      sdkRequest: input.sdkRequest,
    });
  }
}

/**
 * Insert index row (always-on, §6). Returns the invocation id, or null only
 * if the write itself failed — never gated by AI_INVOCATION_LOGGING_ENABLED.
 */
export async function startAiInvocation(
  input: StartAiInvocationInput,
): Promise<string | null> {
  const invocationId = crypto.randomUUID();
  try {
    await persistAiInvocationStart(input, invocationId);
    return invocationId;
  } catch (err) {
    logInvocationError("failed to persist start", err);
    return null;
  }
}

/**
 * Allocate an invocation id and persist start in the background (chat streaming).
 * Does not block time-to-first-token.
 */
export function scheduleAiInvocationStart(
  input: StartAiInvocationInput,
): string | null {
  const invocationId = crypto.randomUUID();
  void persistAiInvocationStart(input, invocationId).catch((err) =>
    logInvocationError("failed to persist scheduled start", err),
  );
  return invocationId;
}

export function scheduleFailAiInvocation(
  invocationId: string,
  error: unknown,
  startedAtMs?: number,
  partialSdkResponse?: unknown,
): void {
  void failAiInvocation(
    invocationId,
    error,
    startedAtMs,
    partialSdkResponse,
  ).catch((err) => logInvocationError("failed to schedule fail", err));
}

export async function completeAiInvocation(
  invocationId: string,
  input: CompleteAiInvocationInput,
  startedAtMs?: number,
): Promise<void> {
  const service = createServiceRoleClient();
  const completedAt = new Date();
  const durationMs =
    startedAtMs !== undefined
      ? Math.max(0, completedAt.getTime() - startedAtMs)
      : null;

  const usage =
    input.usage ?? usageFromLoggedSdkResponse(input.sdkResponse) ?? null;
  const tokenDetails =
    input.tokenDetails ?? tokenDetailsFromLoggedSdkResponse(input.sdkResponse) ?? null;

  // Re-read what was recorded at start — model/usage_type are the row's own
  // properties, not something every completer should have to carry forward.
  const { data: startedRow, error: fetchError } = await service
    .from("ai_invocations")
    .select("ai_model_id, usage_type")
    .eq("id", invocationId)
    .maybeSingle();
  if (fetchError) {
    logInvocationError("failed to read row for pricing", fetchError);
  }
  const catalogModelId = (startedRow?.ai_model_id as string | undefined) ?? null;
  const usageType = (startedRow?.usage_type as UsageType | undefined) ?? "text_generation";

  const computed = catalogModelId
    ? computeUsage({
        catalogModelId,
        usageType,
        metrics: {
          inputTokens: usage?.promptTokens ?? null,
          outputTokens: usage?.completionTokens ?? null,
          tokenDetails,
          audioSeconds: input.audioMs != null ? input.audioMs / 1000 : null,
          characters: input.characters ?? null,
          audioOutputSeconds:
            input.audioOutputMs != null ? input.audioOutputMs / 1000 : null,
          sessionSeconds: input.sessionMs != null ? input.sessionMs / 1000 : null,
        },
      })
    : {
        costUsd: null,
        credits: null,
        rateVersion: CURRENT_RATE_VERSION,
        missingRate: true,
        nativeCostUnits: null,
        nativeUnit: null,
      };

  if (computed.missingRate) {
    logAppEvent({
      level: "warn",
      source: "usage_metering",
      event: "missing_rate",
      message: `No rate resolvable for model "${catalogModelId ?? "unknown"}" / usage_type "${usageType}"`,
      aiInvocationId: invocationId,
    });
  }

  const captureEnabled = isAiInvocationLoggingEnabled();
  const paths = captureEnabled ? aiInvocationStoragePaths(invocationId) : null;
  if (paths) {
    scheduleInvocationPayloadUpload(invocationId, paths.responseStoragePath, {
      invocationId,
      recordedAt: completedAt.toISOString(),
      status: "completed",
      sdkResponse: input.sdkResponse,
      usage,
      finishReason: input.finishReason ?? null,
      error: null,
    });
  }

  const { error } = await service
    .from("ai_invocations")
    .update({
      status: "completed",
      completed_at: completedAt.toISOString(),
      duration_ms: durationMs,
      prompt_tokens: usage?.promptTokens ?? null,
      completion_tokens: usage?.completionTokens ?? null,
      total_tokens: usage?.totalTokens ?? null,
      audio_ms: input.audioMs ?? null,
      characters: input.characters ?? null,
      audio_output_ms: input.audioOutputMs ?? null,
      session_ms: input.sessionMs ?? null,
      metric_source: input.metricSource ?? null,
      token_details: tokenDetails,
      provider_request_id: input.providerRequestId ?? null,
      cost_usd: computed.costUsd,
      credits: computed.credits,
      rate_version: computed.rateVersion,
      native_cost_units: computed.nativeCostUnits,
      native_cost_unit: computed.nativeUnit,
      response_storage_path: paths?.responseStoragePath ?? null,
    })
    .eq("id", invocationId);

  if (error) {
    logInvocationError("failed to complete row", error);
    logAppEvent({
      level: "error",
      source: "usage_metering",
      event: "complete_write_failed",
      message: error.message,
      aiInvocationId: invocationId,
    });
  }
}

export async function failAiInvocation(
  invocationId: string,
  error: unknown,
  startedAtMs?: number,
  partialSdkResponse?: unknown,
): Promise<void> {
  const service = createServiceRoleClient();
  const completedAt = new Date();
  const durationMs =
    startedAtMs !== undefined
      ? Math.max(0, completedAt.getTime() - startedAtMs)
      : null;
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");

  const captureEnabled = isAiInvocationLoggingEnabled();
  const paths = captureEnabled ? aiInvocationStoragePaths(invocationId) : null;
  if (paths) {
    scheduleInvocationPayloadUpload(invocationId, paths.responseStoragePath, {
      invocationId,
      recordedAt: completedAt.toISOString(),
      status: "failed",
      sdkResponse: partialSdkResponse ?? null,
      usage: null,
      finishReason: null,
      error: message,
    });
  }

  const { error: updateError } = await service
    .from("ai_invocations")
    .update({
      status: "failed",
      error_message: message,
      completed_at: completedAt.toISOString(),
      duration_ms: durationMs,
      response_storage_path: paths?.responseStoragePath ?? null,
    })
    .eq("id", invocationId);

  if (updateError) {
    logInvocationError("failed to mark row failed", updateError);
  }
}

export async function linkInvocationToChatMessage(
  invocationId: string,
  chatMessageId: string,
): Promise<void> {
  const service = createServiceRoleClient();
  const { error } = await service
    .from("ai_invocations")
    .update({
      related_entity_type: "chat_message",
      related_entity_id: chatMessageId,
    })
    .eq("id", invocationId);

  if (error) {
    logInvocationError("failed to link chat_message on invocation", error);
  }
}

export async function setChatMessageInvocationId(
  chatMessageId: string,
  invocationId: string,
): Promise<void> {
  const service = createServiceRoleClient();
  const { error } = await service
    .from("chat_messages")
    .update({ ai_invocation_id: invocationId })
    .eq("id", chatMessageId);

  if (error) {
    logInvocationError("failed to set chat_message ai_invocation_id", error);
  }
}
