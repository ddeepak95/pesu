import "server-only";

import type { AppFunctionKey } from "@/lib/ai/catalog/appFunctions";
import { resolveCatalogModelConfigForPlatform } from "@/lib/ai/catalog/resolveRuntime";
import { getCachedResolveModelConfig } from "@/lib/ai/credentials/modelConfigCache";
import { modelMetaFromResolved } from "@/lib/ai/logging/types";
import { keyOwnerFromSource } from "@/lib/ai/metering/keyOwner";
import { assertWithinQuota, resolveWalletId } from "@/lib/ai/metering/quota";
import type { UsageType } from "@/lib/ai/metering/usageTypes";
import { getLanguageModel } from "@/lib/ai/provider";
import { providerOptionsForConfig } from "@/lib/ai/providerOptions";
import type { OnRetryAttempt } from "@/lib/ai/retry";
import { resolveInstitutionId } from "@/lib/logging/appLog";
import { createServiceRoleClient } from "@/lib/supabase-server";
import type { AiConfigSource } from "@/types/aiSettings";
import type { FlexibleSchema } from "ai";
import {
  createMultimodalTurnStream,
  type MultimodalTurnStreamOptions,
} from "./turnStream";
import { generateStructuredInternal } from "./structured";

/**
 * Shared per-call context, threaded through to every ai_invocations row
 * written by this handle (§7.1 pinned API).
 */
export interface AiCallContext {
  /** null only for platform-scope work (no class involved). */
  classDbId: string | null;
  assignmentId?: string | null;
  submissionId?: string | null;
  questionOrder?: number | null;
  questionId?: string | null;
  attemptNumber?: number | null;
  attemptId?: string | null;
  sessionId?: string | null;
  /** Acting user (request auth). */
  userId?: string | null;
  relatedEntity?: { type: string; id: string } | null;
  /**
   * Set by the turn / utterance / transcribe routes on session-internal
   * calls — the session's admission was already checked once at
   * attempt-start (dev-docs/ai-usage-metering-phase3-plan.md D6), so the
   * gateway skips its own per-call quota check for these.
   */
  admittedAtSessionStart?: boolean;
  /**
   * Set by evaluate only — rides through the quota check unconditionally
   * (debits, may drive the wallet negative; grading already-completed work
   * must never be blocked, D6).
   */
  quotaPolicy?: "ride-through";
}

export interface MeteredTextModel {
  readonly meta: { provider: string; modelId: string; keySource: AiConfigSource };
  /** The invocation id of the most recent generateStructured call (overwritten on every call). */
  readonly lastInvocationId: string | null;
  /** Resolved once at handle resolution (D2) — null for platform-scope calls. */
  readonly institutionId: string | null;
  /** Resolved once at handle resolution — null when no wallet exists for this scope (D5). */
  readonly walletId: string | null;
  generateStructured<T>(opts: {
    schema: FlexibleSchema<T>;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    maxRetries?: number;
    onRetryAttempt?: OnRetryAttempt;
    schemaName?: string;
  }): Promise<T>;
  /** Wraps createMultimodalTurnStream for the turn route — model/providerOptions injected from the handle. */
  streamTurn(
    opts: Omit<MultimodalTurnStreamOptions, "model" | "providerOptions">,
  ): ReturnType<typeof createMultimodalTurnStream>;
}

class MeteredTextModelImpl implements MeteredTextModel {
  readonly meta: { provider: string; modelId: string; keySource: AiConfigSource };
  private _lastInvocationId: string | null = null;

  get lastInvocationId(): string | null {
    return this._lastInvocationId;
  }

  constructor(
    private readonly runtime: ReturnType<typeof getLanguageModel>,
    private readonly providerOptions: ReturnType<typeof providerOptionsForConfig>,
    modelMeta: { provider: string; modelId: string; keySource: AiConfigSource },
    private readonly appFunctionKey: AppFunctionKey,
    private readonly usageType: UsageType,
    private readonly context: AiCallContext,
    readonly institutionId: string | null,
    readonly walletId: string | null,
  ) {
    this.meta = modelMeta;
  }

  async generateStructured<T>(opts: {
    schema: FlexibleSchema<T>;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    maxRetries?: number;
    onRetryAttempt?: OnRetryAttempt;
    schemaName?: string;
  }): Promise<T> {
    const { output, invocationId } = await generateStructuredInternal({
      model: this.runtime,
      providerOptions: this.providerOptions,
      schema: opts.schema,
      messages: opts.messages,
      maxRetries: opts.maxRetries,
      onRetryAttempt: opts.onRetryAttempt,
      invocation: {
        appFunctionKey: this.appFunctionKey,
        usageType: this.usageType,
        model: this.meta,
        classId: this.context.classDbId,
        assignmentId: this.context.assignmentId,
        submissionId: this.context.submissionId,
        questionOrder: this.context.questionOrder,
        questionId: this.context.questionId,
        attemptNumber: this.context.attemptNumber,
        attemptId: this.context.attemptId,
        sessionId: this.context.sessionId,
        userId: this.context.userId,
        relatedEntityType: this.context.relatedEntity?.type ?? null,
        relatedEntityId: this.context.relatedEntity?.id ?? null,
        schemaName: opts.schemaName,
        institutionId: this.institutionId,
        walletId: this.walletId,
      },
    });
    this._lastInvocationId = invocationId;
    return output;
  }

  streamTurn(opts: Omit<MultimodalTurnStreamOptions, "model" | "providerOptions">) {
    return createMultimodalTurnStream({
      ...opts,
      model: this.runtime,
      providerOptions: this.providerOptions,
    });
  }
}

/**
 * Resolve a metered text-generation handle. Model resolution + credential
 * lookup happen here, once — everything the caller needs (raw model,
 * provider options, metering context) is bound into the handle, so there is
 * no raw LanguageModelV3 or API key left in circulation for a call site to
 * misuse or forget to log (§7.1).
 *
 * Quota enforcement (dev-docs/ai-usage-metering-phase3-plan.md D2, D6):
 * institutionId/walletId are resolved here, once, right after keySource is
 * known and before the handle is constructed. A per-call balance check
 * (assertWithinQuota) runs unless the caller marks the call as already
 * admitted at session start (`admittedAtSessionStart`) or explicitly
 * ride-through (`quotaPolicy: 'ride-through'`, evaluate only) — the
 * fail-closed default is to check.
 */
export async function resolveMeteredModel(input: {
  appFunctionKey: AppFunctionKey;
  usageType?: UsageType;
  context: AiCallContext;
}): Promise<MeteredTextModel> {
  const classDbId = input.context.classDbId;
  const { config, keySource } = classDbId
    ? await getCachedResolveModelConfig({
        classDbId,
        appFunctionKey: input.appFunctionKey,
      })
    : await resolveCatalogModelConfigForPlatform(input.appFunctionKey);

  const institutionId = classDbId
    ? await resolveInstitutionId(createServiceRoleClient(), classDbId)
    : null;

  let walletId: string | null = null;
  if (institutionId && classDbId) {
    const keyOwner = keyOwnerFromSource(keySource);
    walletId = await resolveWalletId({ institutionId, classId: classDbId, keyOwner });

    const shouldCheck =
      input.context.admittedAtSessionStart !== true &&
      input.context.quotaPolicy !== "ride-through";
    if (shouldCheck) {
      await assertWithinQuota({ institutionId, classId: classDbId, keyOwner });
    }
  }

  const model = getLanguageModel(config);
  const providerOptions = providerOptionsForConfig(config);
  const modelMeta = modelMetaFromResolved(config, keySource);

  return new MeteredTextModelImpl(
    model,
    providerOptions,
    modelMeta,
    input.appFunctionKey,
    input.usageType ?? "text_generation",
    input.context,
    institutionId,
    walletId,
  );
}
