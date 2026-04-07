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
import { withRetry } from "./retry";

interface GenerateStructuredOptions<T> {
  model: LanguageModelV3;
  schema: Schema<T>;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  providerOptions?: SharedV3ProviderOptions;
  maxRetries?: number;
}

export async function generateStructured<T>(
  options: GenerateStructuredOptions<T>,
): Promise<T> {
  const { model, schema, messages, providerOptions, maxRetries } = options;

  const result = await withRetry(
    () =>
      generateText({
        model,
        output: Output.object({ schema }),
        messages,
        providerOptions,
      }),
    maxRetries,
  );

  return result.output as T;
}
