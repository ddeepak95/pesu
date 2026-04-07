/**
 * Thin wrapper around generateObject that applies shared defaults
 * and composes with the retry helper.
 */

import { generateObject } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { Schema } from "ai";
import { withRetry } from "./retry";

interface GenerateStructuredOptions<T> {
  model: LanguageModelV3;
  schema: Schema<T>;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  maxRetries?: number;
}

export async function generateStructured<T>(
  options: GenerateStructuredOptions<T>,
): Promise<T> {
  const { model, schema, messages, maxRetries } = options;

  const result = await withRetry(
    () =>
      generateObject({
        model,
        schema,
        messages,
      }),
    maxRetries,
  );

  return result.object;
}
