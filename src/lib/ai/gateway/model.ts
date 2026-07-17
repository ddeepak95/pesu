import "server-only";

import type { AppFunctionKey } from "@/lib/ai/catalog/appFunctions";
import { resolveCatalogModelConfigForPlatform } from "@/lib/ai/catalog/resolveRuntime";
import { getCachedResolveModelConfig } from "@/lib/ai/credentials/modelConfigCache";
import { modelMetaFromResolved, type AiInvocationModelMeta } from "@/lib/ai/logging/types";
import { assertClassAiAccessAllowed, assertPlatformAiAccessAllowed } from "@/lib/ai/metering/access";
import { isByokSource } from "@/lib/ai/metering/keyOwner";
import {
  assertWithinQuota,
  resolveByokCapWalletId,
  resolveCapWalletId,
} from "@/lib/ai/metering/quota";
import type { UsageType } from "@/lib/ai/metering/usageTypes";
import { getLanguageModel } from "@/lib/ai/provider";
import { providerOptionsForConfig } from "@/lib/ai/providerOptions";
import type { OnRetryAttempt } from "@/lib/ai/retry";
import { resolveInstitutionId } from "@/lib/logging/appLog";
import { createServiceRoleClient } from "@/lib/supabase-server";
import type { AiConfigSource } from "@/types/aiSettings";
import type { FlexibleSchema } from "ai";
import {
  completeAiInvocation,
  scheduleAiInvocationStart,
  scheduleFailAiInvocation,
} from "@/lib/ai/logging/recordInvocation";
import type { CompleteAiInvocationInput, StartAiInvocationInput } from "@/lib/ai/logging/types";
import {
  createMultimodalTurnStream,
  type MultimodalTurnStreamOptions,
} from "./turnStream";
import { generateStructuredInternal } from "./structured";

/**
 * What a `streamTurn` caller supplies to `startInvocation` — everything on
 * `StartAiInvocationInput` except the fields the handle already resolved
 * (D2/D5) and binds itself below. Keeping these out of the caller-facing
 * type is the point: a hand-rolled `scheduleAiInvocationStart` call could
 * silently omit `institutionId`/`walletId` (as the turn route once did —
 * dev-docs/ai-usage-metering-phase3-plan.md's wallet-debit gap), but a
 * caller here has no field to omit them from.
 */
type HandleStartInvocationInput = Omit<
  StartAiInvocationInput,
  "appFunctionKey" | "usageType" | "institutionId" | "walletId" | "model"
> & {
  model?: AiInvocationModelMeta;
};

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
  /**
   * For `streamTurn` callers only — `generateStructured` logs its own row
   * automatically and never needs this. Fire-and-forget row creation with
   * this handle's `appFunctionKey`/`usageType`/`institutionId`/`walletId`
   * baked in, so a caller managing its own retry loop (as the turn route
   * does) can't drop metering attribution the way a hand-rolled
   * `scheduleAiInvocationStart` call once did.
   */
  startInvocation(input: HandleStartInvocationInput): string | null;
  /** Thin pass-through so `streamTurn` callers never need their own import of recordInvocation.ts. */
  completeInvocation(
    invocationId: string,
    input: CompleteAiInvocationInput,
    startedAtMs?: number,
  ): Promise<void>;
  /** Thin pass-through — see `completeInvocation`. */
  scheduleFailInvocation(
    invocationId: string,
    error: unknown,
    startedAtMs?: number,
    partialSdkResponse?: unknown,
  ): void;
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

  startInvocation(input: HandleStartInvocationInput): string | null {
    return scheduleAiInvocationStart({
      ...input,
      appFunctionKey: this.appFunctionKey,
      usageType: this.usageType,
      institutionId: this.institutionId,
      walletId: this.walletId,
      model: input.model ?? this.meta,
    });
  }

  completeInvocation(
    invocationId: string,
    input: CompleteAiInvocationInput,
    startedAtMs?: number,
  ): Promise<void> {
    return completeAiInvocation(invocationId, input, startedAtMs);
  }

  scheduleFailInvocation(
    invocationId: string,
    error: unknown,
    startedAtMs?: number,
    partialSdkResponse?: unknown,
  ): void {
    scheduleFailAiInvocation(invocationId, error, startedAtMs, partialSdkResponse);
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
    const byok = isByokSource(keySource);

    // Real-time kill switch (decision 1) — checked on every call that isn't
    // using the class's own key, including ones already admitted at session
    // start: unlike a wallet balance, an admin turning access off is meant
    // to take effect immediately, not wait for the next session.
    if (!byok) {
      await assertPlatformAiAccessAllowed(institutionId);
    }
    if (keySource !== "class") {
      await assertClassAiAccessAllowed(classDbId);
    }

    if (!byok) {
      walletId = await resolveCapWalletId(institutionId, classDbId);

      const shouldCheck =
        input.context.admittedAtSessionStart !== true &&
        input.context.quotaPolicy !== "ride-through";
      if (shouldCheck) {
        await assertWithinQuota({ institutionId, classId: classDbId });
      }
    } else {
      // BYOK never debits or gates the institution pool — the provider bills
      // the key owner. It counts against the class cap only when the cap's
      // matching count_*_byok flag is on (walletId non-null is the signal
      // completeAiInvocation uses to debit the cap alone).
      walletId = await resolveByokCapWalletId(institutionId, classDbId, keySource);

      const shouldCheck =
        walletId !== null &&
        input.context.admittedAtSessionStart !== true &&
        input.context.quotaPolicy !== "ride-through";
      if (shouldCheck) {
        await assertWithinQuota(
          { institutionId, classId: classDbId },
          { includePool: false },
        );
      }
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
