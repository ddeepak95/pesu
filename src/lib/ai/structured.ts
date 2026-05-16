/**
 * Thin wrapper around generateText with Output.object() that applies shared
 * defaults and composes with the retry helper.
 *
 * generateObject is deprecated in AI SDK v6; the replacement is:
 *   generateText({ output: Output.object({ schema }) })
 */

import { generateText, Output } from "ai";
import type { LanguageModelV3, SharedV3ProviderOptions } from "@ai-sdk/provider";
import type { Schema } from "ai";
import {
  DEFAULT_MAX_ATTEMPTS,
  isRetryable,
  waitBeforeRetry,
} from "./retry";
import type { StartAiInvocationInput } from "./logging/types";
import {
  failAiInvocation,
  startAiInvocation,
  completeAiInvocation,
} from "./logging/recordInvocation";
import {
  buildLoggedGenerateTextRequest,
  buildLoggedSdkResponse,
} from "./logging/serialize";

interface GenerateStructuredOptions<T> {
  model: LanguageModelV3;
  schema: Schema<T>;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  providerOptions?: SharedV3ProviderOptions;
  maxRetries?: number;
  /** When set, each provider attempt is logged to ai_invocations + GCS. */
  invocation?: Omit<
    StartAiInvocationInput,
    "sdkRequest" | "retryOf" | "retryIndex"
  > & {
    schemaName?: string;
  };
}

export async function generateStructured<T>(
  options: GenerateStructuredOptions<T>,
): Promise<T> {
  const {
    model,
    schema,
    messages,
    providerOptions,
    maxRetries = DEFAULT_MAX_ATTEMPTS,
    invocation,
  } = options;

  let firstInvocationId: string | null = null;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let invocationId: string | null = null;
    const startedAtMs = Date.now();

    const sdkRequest = buildLoggedGenerateTextRequest({
      messages,
      providerOptions,
      schemaName: invocation?.schemaName,
    });

    if (invocation) {
      invocationId = await startAiInvocation({
        ...invocation,
        sdkRequest,
        retryOf: firstInvocationId,
        retryIndex: attempt - 1,
      });
      if (attempt === 1) {
        firstInvocationId = invocationId;
      }
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
        await completeAiInvocation(
          invocationId,
          {
            sdkResponse,
            usage,
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
        await failAiInvocation(
          invocationId,
          err,
          startedAtMs,
          partialSdkResponse,
        );
      }

      if (!isRetryable(err) || attempt === maxRetries) {
        throw err;
      }

      await waitBeforeRetry(err, attempt - 1);
    }
  }

  throw lastError;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
