import "server-only";

import type { AppFunctionKey } from "@/lib/ai/catalog/appFunctions";
import { resolveCatalogModelConfigForPlatform } from "@/lib/ai/catalog/resolveRuntime";
import { getCachedResolveModelConfig } from "@/lib/ai/credentials/modelConfigCache";
import { modelMetaFromResolved } from "@/lib/ai/logging/types";
import type { UsageType } from "@/lib/ai/metering/usageTypes";
import { getLanguageModel } from "@/lib/ai/provider";
import { providerOptionsForConfig } from "@/lib/ai/providerOptions";
import type { OnRetryAttempt } from "@/lib/ai/retry";
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
  attemptNumber?: number | null;
  /** Acting user (request auth). */
  userId?: string | null;
  relatedEntity?: { type: string; id: string } | null;
}

export interface MeteredTextModel {
  readonly meta: { provider: string; modelId: string; keySource: AiConfigSource };
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

  constructor(
    private readonly runtime: ReturnType<typeof getLanguageModel>,
    private readonly providerOptions: ReturnType<typeof providerOptionsForConfig>,
    modelMeta: { provider: string; modelId: string; keySource: AiConfigSource },
    private readonly appFunctionKey: AppFunctionKey,
    private readonly usageType: UsageType,
    private readonly context: AiCallContext,
  ) {
    this.meta = modelMeta;
  }

  generateStructured<T>(opts: {
    schema: FlexibleSchema<T>;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    maxRetries?: number;
    onRetryAttempt?: OnRetryAttempt;
    schemaName?: string;
  }): Promise<T> {
    return generateStructuredInternal({
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
        attemptNumber: this.context.attemptNumber,
        userId: this.context.userId,
        relatedEntityType: this.context.relatedEntity?.type ?? null,
        relatedEntityId: this.context.relatedEntity?.id ?? null,
        schemaName: opts.schemaName,
      },
    });
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
 * Quota enforcement (assertWithinQuota, §8) is a Phase 3 concern — this
 * handle currently always admits the call (Phase 1: "Gateway + universal
 * capture, no enforcement", §9).
 */
export async function resolveMeteredModel(input: {
  appFunctionKey: AppFunctionKey;
  usageType?: UsageType;
  context: AiCallContext;
}): Promise<MeteredTextModel> {
  const { config, keySource } = input.context.classDbId
    ? await getCachedResolveModelConfig({
        classDbId: input.context.classDbId,
        appFunctionKey: input.appFunctionKey,
      })
    : await resolveCatalogModelConfigForPlatform(input.appFunctionKey);

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
  );
}
