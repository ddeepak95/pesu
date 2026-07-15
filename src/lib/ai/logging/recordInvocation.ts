import "server-only";

import { after } from "next/server";
import { AiContextMissingError, getAiContext } from "@/lib/ai/gateway/context";
import {
  computeUsage,
  disaggregateInputTokens,
  disaggregateOutputTokens,
  usageTypeHasTokenMetrics,
  type TokenDetails,
} from "@/lib/ai/metering/computeUsage";
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
    questionId: ctx.questionId ?? null,
    attemptNumber: ctx.attemptNumber ?? null,
    attemptId: ctx.attemptId ?? null,
    sessionId: ctx.sessionId ?? null,
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

/**
 * Isolated, retried write to the ai_usage_counters cache (D2). Never allowed
 * to fail the caller's AI response — the source-of-truth ai_invocations row
 * is already committed by the time this runs. The first attempt is awaited
 * inline; on failure the caller schedules retries via after() (zero added
 * response latency), with the nightly reconcile as the last-resort backstop.
 */
interface UsageCounterRpcArgs {
  p_institution_id: string | null;
  p_class_id: string | null;
  p_ai_key_source: string;
  p_started_at: string;
  p_usage_type: string;
  p_credits: number;
}

const COUNTER_RETRY_DELAYS_MS = [200, 1000, 3000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function upsertUsageCounter(rpcArgs: UsageCounterRpcArgs): Promise<boolean> {
  try {
    const service = createServiceRoleClient();
    const { error } = await service.rpc("record_usage_counter", rpcArgs);
    if (error) {
      logAppEvent({
        level: "warn",
        source: "usage_metering",
        event: "counter_upsert_failed",
        message: error.message,
      });
      return false;
    }
    return true;
  } catch (err) {
    logAppEvent({
      level: "warn",
      source: "usage_metering",
      event: "counter_upsert_failed",
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
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

/**
 * Pulls the per-modality (audio/image) input-token breakdown out of
 * provider-specific metadata. The AI SDK's typed `usage` object collapses
 * Gemini's raw `promptTokensDetails` (a `[{modality, tokenCount}, ...]`
 * array covering TEXT/AUDIO/IMAGE/VIDEO) down to just a cache-read split —
 * see @ai-sdk/google's convertGoogleGenerativeAIUsage — so the modality
 * breakdown only survives on `providerMetadata.google.usageMetadata` (or
 * `.vertex.usageMetadata` on Vertex). Needed to price direct-audio-input
 * turns at the rate card's `audio_input_token` rate instead of the blended
 * `input_token` rate.
 */
function tokenDetailsFromProviderMetadata(providerMetadata: unknown): TokenDetails | null {
  if (!providerMetadata || typeof providerMetadata !== "object") return null;
  const pm = providerMetadata as Record<string, unknown>;
  const googleMeta = (pm.google ?? pm.vertex) as Record<string, unknown> | undefined;
  const usageMetadata = googleMeta?.usageMetadata as Record<string, unknown> | undefined;
  const details = usageMetadata?.promptTokensDetails;
  if (!Array.isArray(details)) return null;

  let audioInputTokens: number | undefined;
  let imageInputTokens: number | undefined;
  for (const entry of details) {
    if (!entry || typeof entry !== "object") continue;
    const { modality, tokenCount } = entry as { modality?: unknown; tokenCount?: unknown };
    if (typeof tokenCount !== "number") continue;
    if (modality === "AUDIO") audioInputTokens = tokenCount;
    else if (modality === "IMAGE") imageInputTokens = tokenCount;
  }
  if (audioInputTokens == null && imageInputTokens == null) return null;
  return {
    ...(audioInputTokens != null ? { audioInputTokens } : {}),
    ...(imageInputTokens != null ? { imageInputTokens } : {}),
  };
}

function mergeTokenDetails(...parts: Array<TokenDetails | null>): TokenDetails | null {
  const merged: TokenDetails = {};
  for (const part of parts) {
    if (part) Object.assign(merged, part);
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

export function usageFromAiSdkResult(result: {
  usage?: PromiseLike<SdkUsage>;
}): Promise<CompleteAiInvocationInput["usage"]> {
  if (!result.usage) return Promise.resolve(null);
  return Promise.resolve(result.usage).then((u) => usageFromSdk(u));
}

export function tokenDetailsFromAiSdkResult(result: {
  usage?: PromiseLike<SdkUsage>;
  providerMetadata?: PromiseLike<unknown>;
}): Promise<TokenDetails | null> {
  return Promise.all([
    result.usage ? Promise.resolve(result.usage) : Promise.resolve(undefined),
    result.providerMetadata ? Promise.resolve(result.providerMetadata) : Promise.resolve(undefined),
  ]).then(([usage, providerMetadata]) =>
    mergeTokenDetails(tokenDetailsFromSdk(usage), tokenDetailsFromProviderMetadata(providerMetadata)),
  );
}

/** Direct (non-promise) usage/providerMetadata — for callers like generateText whose results are already resolved. */
export function tokenDetailsFromSdkUsage(
  usage: SdkUsage | undefined | null,
  providerMetadata?: unknown,
): TokenDetails | null {
  return mergeTokenDetails(tokenDetailsFromSdk(usage), tokenDetailsFromProviderMetadata(providerMetadata));
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

  // Runtime attribution backstop (§4/D4): explicit input wins, ambient
  // runWithAiContext() fills the rest. `ambient === undefined` (as opposed to
  // an ambient context whose fields are legitimately null) means no call site
  // ever wrapped this request at all — the case this backstop exists to catch.
  const ambient = getAiContext();
  const userId = input.userId ?? ambient?.userId ?? null;
  const classId = input.classId ?? ambient?.classId ?? null;
  const contextMissing = ambient === undefined && classId == null && userId == null;

  if (contextMissing) {
    if (process.env.NODE_ENV !== "production") {
      throw new AiContextMissingError(
        `AI invocation "${input.appFunctionKey}" has no request context — wrap the call site in runWithAiContext(), or pass classId/userId explicitly.`,
      );
    }
    logAppEvent({
      level: "error",
      source: "usage_metering",
      event: "ai_context_missing",
      message: `AI invocation "${input.appFunctionKey}" started with no attribution context (no runWithAiContext() active, classId/userId both null).`,
    });
  }

  // Widened to `string` locally — no DB constraint blocks the "unattributed"
  // sentinel, and it's only ever used on the production-degrade path above.
  const appFunctionKey: string = contextMissing ? "unattributed" : input.appFunctionKey;

  const institutionId = classId
    ? await resolveInstitutionId(service, classId)
    : null;

  // The row is always written — it's the system of record for billing/usage,
  // independent of whether GCS debug-payload capture is enabled (§6).
  const { error: insertError } = await service.from("ai_invocations").insert({
    id: invocationId,
    app_function_key: appFunctionKey,
    usage_type: input.usageType ?? "text_generation",
    ai_provider: input.model.provider,
    ai_model_id: input.model.modelId,
    ai_key_source: input.model.keySource,
    class_id: classId,
    institution_id: institutionId,
    user_id: userId,
    assignment_id: input.assignmentId ?? null,
    submission_id: input.submissionId ?? null,
    question_order: input.questionOrder ?? null,
    question_id: input.questionId ?? null,
    attempt_number: input.attemptNumber ?? null,
    attempt_id: input.attemptId ?? null,
    session_id: input.sessionId ?? null,
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
    if (err instanceof AiContextMissingError) throw err;
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
  // Also carries the attribution fields the counter upsert needs below (one
  // extra round-trip was already happening here, no new query).
  const { data: startedRow, error: fetchError } = await service
    .from("ai_invocations")
    .select("ai_model_id, usage_type, ai_key_source, institution_id, class_id, started_at")
    .eq("id", invocationId)
    .maybeSingle();
  if (fetchError) {
    logInvocationError("failed to read row for pricing", fetchError);
  }
  const catalogModelId = (startedRow?.ai_model_id as string | undefined) ?? null;
  const usageType = (startedRow?.usage_type as UsageType | undefined) ?? "text_generation";

  // Full, self-consistent breakdown for storage: `tokenDetails` above only
  // carries the SDK-reported subsets (cached/reasoning/audio/image); fold in
  // the derived `textInputTokens`/`textOutputTokens` remainder — computed via
  // the same split computeUsage bills from — so `token_details` fully
  // partitions the blended prompt/completion totals instead of only covering
  // the "special" classes. This is now the ONLY place those totals are
  // persisted — the row has no separate prompt_tokens/completion_tokens/
  // total_tokens columns; sum token_details' fields to recover them.
  const disaggregatedTokenDetails: TokenDetails = usageTypeHasTokenMetrics(usageType)
    ? {
        ...disaggregateInputTokens(usage?.promptTokens, tokenDetails),
        ...disaggregateOutputTokens(usage?.completionTokens, tokenDetails),
      }
    : {};
  const storedTokenDetails: TokenDetails | null =
    Object.keys(disaggregatedTokenDetails).length > 0 ? disaggregatedTokenDetails : tokenDetails;

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
          sttAudioInputTokens: input.sttAudioInputTokens ?? null,
          sttOutputTokens: input.sttOutputTokens ?? null,
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
      audio_ms: input.audioMs ?? null,
      characters: input.characters ?? null,
      audio_output_ms: input.audioOutputMs ?? null,
      session_ms: input.sessionMs ?? null,
      metric_source: input.metricSource ?? null,
      token_details: storedTokenDetails,
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
    return;
  }

  if (computed.credits != null && startedRow) {
    const rpcArgs: UsageCounterRpcArgs = {
      p_institution_id: (startedRow.institution_id as string | null) ?? null,
      p_class_id: (startedRow.class_id as string | null) ?? null,
      p_ai_key_source: (startedRow.ai_key_source as string | null) ?? "unconfigured",
      p_started_at: (startedRow.started_at as string | null) ?? completedAt.toISOString(),
      p_usage_type: usageType,
      p_credits: computed.credits,
    };

    const firstAttemptSucceeded = await upsertUsageCounter(rpcArgs);
    if (!firstAttemptSucceeded) {
      after(async () => {
        for (const delayMs of COUNTER_RETRY_DELAYS_MS) {
          await sleep(delayMs);
          if (await upsertUsageCounter(rpcArgs)) return;
        }
        logAppEvent({
          level: "error",
          source: "usage_metering",
          event: "counter_upsert_exhausted",
          message: `record_usage_counter failed after ${COUNTER_RETRY_DELAYS_MS.length} retries.`,
          aiInvocationId: invocationId,
        });
      });
    }
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

export async function linkInvocationToAttempt(
  invocationId: string,
  attemptId: string,
): Promise<void> {
  const service = createServiceRoleClient();
  const { error } = await service
    .from("ai_invocations")
    .update({ attempt_id: attemptId })
    .eq("id", invocationId);

  if (error) {
    logInvocationError("failed to link attempt on invocation", error);
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
