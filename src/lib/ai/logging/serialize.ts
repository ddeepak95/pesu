import "server-only";

import type { SharedV3ProviderOptions } from "@ai-sdk/provider";

const SENSITIVE_KEY = /^(.*\.)?(api[_-]?key|secret|token|authorization|password)$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep-clone JSON-safe values and redact sensitive keys. */
export function redactSecrets<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item)) as T;
  }

  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = redactSecrets(child);
      }
    }
    return out as T;
  }

  return value;
}

function safeJsonClone<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

async function resolveMaybePromise<T>(value: T | PromiseLike<T>): Promise<T> {
  if (
    value !== null &&
    typeof value === "object" &&
    "then" in value &&
    typeof (value as PromiseLike<T>).then === "function"
  ) {
    return Promise.resolve(value as PromiseLike<T>);
  }
  return value as T;
}

function serializeStep(step: unknown): unknown {
  if (!isPlainObject(step)) return step;
  return redactSecrets(
    safeJsonClone({
      text: step.text,
      finishReason: step.finishReason,
      usage: step.usage,
      toolCalls: step.toolCalls,
      toolResults: step.toolResults,
      content: step.content,
      response: step.response,
    }),
  );
}

export interface LoggedGenerateTextRequest {
  call: "generateText";
  messages: Array<{ role: string; content: string }>;
  providerOptions: SharedV3ProviderOptions | null | undefined;
  output: { type: "object"; schemaName?: string } | null;
}

export function buildLoggedGenerateTextRequest(input: {
  messages: Array<{ role: string; content: string }>;
  providerOptions?: SharedV3ProviderOptions;
  schemaName?: string;
}): LoggedGenerateTextRequest {
  return redactSecrets({
    call: "generateText",
    messages: input.messages,
    providerOptions: input.providerOptions ?? null,
    output: input.schemaName
      ? { type: "object", schemaName: input.schemaName }
      : null,
  });
}

export interface LoggedStreamTextRequest {
  call: "streamText";
  system: string;
  messages: Array<{ role: string; content: string }>;
  tools: Record<
    string,
    { description: string; inputSchema: unknown }
  >;
  toolChoice: string;
  stopWhen: string;
  providerOptions: SharedV3ProviderOptions | null | undefined;
  output: null;
}

export function buildLoggedStreamTextRequest(input: {
  system: string;
  messages: Array<{ role: string; content: string }>;
  tools: Record<string, { description: string; inputSchema: unknown }>;
  toolChoice: string;
  stopWhen: string;
  providerOptions?: SharedV3ProviderOptions;
}): LoggedStreamTextRequest {
  return redactSecrets({
    call: "streamText",
    system: input.system,
    messages: input.messages,
    tools: safeJsonClone(input.tools),
    toolChoice: input.toolChoice,
    stopWhen: input.stopWhen,
    providerOptions: input.providerOptions ?? null,
    output: null,
  });
}

/**
 * Extract serializable fields from a generateText / streamText result.
 */
export async function buildLoggedSdkResponse(
  result: unknown,
): Promise<Record<string, unknown>> {
  const r = result as Record<string, unknown>;

  const [text, output, steps, usage, response, warnings] = await Promise.all([
    resolveMaybePromise(r.text as string | PromiseLike<string> | undefined),
    resolveMaybePromise(r.output),
    resolveMaybePromise(r.steps),
    resolveMaybePromise(r.usage),
    resolveMaybePromise(r.response),
    resolveMaybePromise(r.warnings),
  ]);

  const serializedSteps = Array.isArray(steps)
    ? steps.map(serializeStep)
    : steps ?? null;

  return redactSecrets(
    safeJsonClone({
      text: text ?? null,
      output: output ?? null,
      finishReason: r.finishReason ?? null,
      usage: usage ?? null,
      warnings: warnings ?? null,
      response: response ?? null,
      steps: serializedSteps,
    }),
  ) as Record<string, unknown>;
}
