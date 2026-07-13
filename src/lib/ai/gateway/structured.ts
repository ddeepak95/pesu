import "server-only";

/**
 * Gateway-internal implementation of structured text generation. Formerly
 * src/lib/ai/structured.ts — moved here (§9.1 Step 4, §11 file map) so the
 * only file that imports the `ai` package's execution functions for text
 * generation is inside src/lib/ai/gateway/** (§7.2 import boundary).
 *
 * Not exported outside the gateway: callers get this via
 * MeteredTextModel.generateStructured (gateway/model.ts), which always
 * supplies `invocation` — there is no optional hook left to forget (§5.4).
 */

import type { LanguageModelV3, SharedV3ProviderOptions } from "@ai-sdk/provider";
import type { FlexibleSchema } from "ai";
import { generateText, Output } from "ai";
import {
  failAiInvocation,
  startAiInvocation,
  completeAiInvocation,
  tokenDetailsFromSdkUsage,
} from "@/lib/ai/logging/recordInvocation";
import {
  buildLoggedGenerateTextRequest,
  buildLoggedSdkResponse,
} from "@/lib/ai/logging/serialize";
import type { StartAiInvocationInput } from "@/lib/ai/logging/types";
import {
  DEFAULT_MAX_ATTEMPTS,
  isRetryable,
  waitBeforeRetry,
  type OnRetryAttempt,
} from "@/lib/ai/retry";

export interface GatewayGenerateStructuredOptions<T> {
  model: LanguageModelV3;
  schema: FlexibleSchema<T>;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  providerOptions?: SharedV3ProviderOptions;
  maxRetries?: number;
  onRetryAttempt?: OnRetryAttempt;
  /** Metering context is bound at handle resolution — always present, never optional (§5.4, §7.1). */
  invocation: Omit<StartAiInvocationInput, "sdkRequest" | "retryOf" | "retryIndex"> & {
    schemaName?: string;
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function generateStructuredInternal<T>(
  options: GatewayGenerateStructuredOptions<T>,
): Promise<T> {
  const {
    model,
    schema,
    messages,
    providerOptions,
    maxRetries = DEFAULT_MAX_ATTEMPTS,
    onRetryAttempt,
    invocation,
  } = options;

  let firstInvocationId: string | null = null;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const startedAtMs = Date.now();

    const sdkRequest = buildLoggedGenerateTextRequest({
      messages,
      providerOptions,
      schemaName: invocation.schemaName,
    });

    const invocationId = await startAiInvocation({
      ...invocation,
      sdkRequest,
      retryOf: firstInvocationId,
      retryIndex: attempt - 1,
    });
    if (attempt === 1) {
      firstInvocationId = invocationId;
    }

    try {
      const result = await generateText({
        model,
        output: Output.object({ schema }),
        messages,
        providerOptions,
      });

      if (invocationId) {
        const sdkResponse = await buildLoggedSdkResponse(result);
        const usage = result.usage
          ? {
              promptTokens: result.usage.inputTokens ?? null,
              completionTokens: result.usage.outputTokens ?? null,
              totalTokens: result.usage.totalTokens ?? null,
            }
          : null;
        const tokenDetails = tokenDetailsFromSdkUsage(result.usage, result.providerMetadata);
        await completeAiInvocation(
          invocationId,
          {
            sdkResponse,
            usage,
            tokenDetails,
            finishReason: result.finishReason ?? null,
          },
          startedAtMs,
        );
      }

      return result.output as T;
    } catch (err) {
      lastError = err;

      if (invocationId) {
        let partialSdkResponse: unknown = null;
        if (isPlainObject(err) && "text" in err) {
          try {
            partialSdkResponse = await buildLoggedSdkResponse(err);
          } catch {
            partialSdkResponse = null;
          }
        }
        await failAiInvocation(invocationId, err, startedAtMs, partialSdkResponse);
      }

      if (!isRetryable(err) || attempt === maxRetries) {
        throw err;
      }

      onRetryAttempt?.(attempt, err);
      await waitBeforeRetry(err, attempt - 1);
    }
  }

  throw lastError;
}
