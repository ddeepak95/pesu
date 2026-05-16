import "server-only";

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

function usageFromSdk(usage: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
} | undefined | null) {
  if (!usage) return null;
  return {
    promptTokens: usage.inputTokens ?? null,
    completionTokens: usage.outputTokens ?? null,
    totalTokens: usage.totalTokens ?? null,
  };
}

export function usageFromAiSdkResult(result: {
  usage?: PromiseLike<{
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  }>;
}): Promise<CompleteAiInvocationInput["usage"]> {
  if (!result.usage) return Promise.resolve(null);
  return Promise.resolve(result.usage).then((u) => usageFromSdk(u));
}

function usageFromLoggedSdkResponse(
  sdkResponse: unknown,
): CompleteAiInvocationInput["usage"] {
  if (!sdkResponse || typeof sdkResponse !== "object") return null;
  const usage = (sdkResponse as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object") return null;
  return usageFromSdk(
    usage as {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    },
  );
}

/**
 * Insert index row and upload request.json. Returns invocation id, or null when disabled.
 */
export async function startAiInvocation(
  input: StartAiInvocationInput,
): Promise<string | null> {
  if (!isAiInvocationLoggingEnabled()) return null;

  const service = createServiceRoleClient();
  const invocationId = crypto.randomUUID();
  const paths = aiInvocationStoragePaths(invocationId);

  const { error: insertError } = await service.from("ai_invocations").insert({
    id: invocationId,
    app_function_key: input.appFunctionKey,
    ai_provider: input.model.provider,
    ai_model_id: input.model.modelId,
    ai_key_source: input.model.keySource,
    class_id: input.classId ?? null,
    assignment_id: input.assignmentId ?? null,
    submission_id: input.submissionId ?? null,
    question_order: input.questionOrder ?? null,
    attempt_number: input.attemptNumber ?? null,
    request_storage_path: paths.requestStoragePath,
    response_storage_path: paths.responseStoragePath,
    retry_of: input.retryOf ?? null,
    retry_index: input.retryIndex ?? 0,
    status: "pending",
  });

  if (insertError) {
    console.error("[ai-invocation] failed to insert row:", insertError);
    return null;
  }

  try {
    await uploadInvocationJson(paths.requestStoragePath, {
      invocationId,
      appFunctionKey: input.appFunctionKey,
      recordedAt: new Date().toISOString(),
      context: contextPayload(input),
      model: modelPayload(input.model),
      sdkRequest: input.sdkRequest,
    });
  } catch (err) {
    console.error("[ai-invocation] failed to upload request.json:", err);
  }

  return invocationId;
}

export async function completeAiInvocation(
  invocationId: string,
  input: CompleteAiInvocationInput,
  startedAtMs?: number,
): Promise<void> {
  if (!isAiInvocationLoggingEnabled()) return;

  const service = createServiceRoleClient();
  const paths = aiInvocationStoragePaths(invocationId);
  const completedAt = new Date();
  const durationMs =
    startedAtMs !== undefined
      ? Math.max(0, completedAt.getTime() - startedAtMs)
      : null;

  const usage =
    input.usage ?? usageFromLoggedSdkResponse(input.sdkResponse) ?? null;

  try {
    await uploadInvocationJson(paths.responseStoragePath, {
      invocationId,
      recordedAt: completedAt.toISOString(),
      status: "completed",
      sdkResponse: input.sdkResponse,
      usage,
      finishReason: input.finishReason ?? null,
      error: null,
    });
  } catch (err) {
    console.error("[ai-invocation] failed to upload response.json:", err);
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
      response_storage_path: paths.responseStoragePath,
    })
    .eq("id", invocationId);

  if (error) {
    console.error("[ai-invocation] failed to complete row:", error);
  }
}

export async function failAiInvocation(
  invocationId: string,
  error: unknown,
  startedAtMs?: number,
  partialSdkResponse?: unknown,
): Promise<void> {
  if (!isAiInvocationLoggingEnabled()) return;

  const service = createServiceRoleClient();
  const paths = aiInvocationStoragePaths(invocationId);
  const completedAt = new Date();
  const durationMs =
    startedAtMs !== undefined
      ? Math.max(0, completedAt.getTime() - startedAtMs)
      : null;
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");

  try {
    await uploadInvocationJson(paths.responseStoragePath, {
      invocationId,
      recordedAt: completedAt.toISOString(),
      status: "failed",
      sdkResponse: partialSdkResponse ?? null,
      usage: null,
      finishReason: null,
      error: message,
    });
  } catch (uploadErr) {
    console.error("[ai-invocation] failed to upload error response.json:", uploadErr);
  }

  const { error: updateError } = await service
    .from("ai_invocations")
    .update({
      status: "failed",
      error_message: message,
      completed_at: completedAt.toISOString(),
      duration_ms: durationMs,
      response_storage_path: paths.responseStoragePath,
    })
    .eq("id", invocationId);

  if (updateError) {
    console.error("[ai-invocation] failed to mark row failed:", updateError);
  }
}

export async function linkInvocationToChatMessage(
  invocationId: string,
  chatMessageId: string,
): Promise<void> {
  if (!isAiInvocationLoggingEnabled()) return;

  const service = createServiceRoleClient();
  const { error } = await service
    .from("ai_invocations")
    .update({
      related_entity_type: "chat_message",
      related_entity_id: chatMessageId,
    })
    .eq("id", invocationId);

  if (error) {
    console.error("[ai-invocation] failed to link chat_message:", error);
  }
}
