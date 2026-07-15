import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped AI context — dev-docs/ai-usage-metering-plan.md §7.4,
 * dev-docs/ai-usage-metering-phase2-plan.md §4/D4.
 *
 * Every one of the 8 gateway call sites wraps its handler body in
 * runWithAiContext() right after resolving classId/userId. This is the
 * runtime backstop for attribution: resolveMeteredModel/resolveMeteredSpeech
 * callers still pass an explicit AiCallContext (unchanged), but
 * persistAiInvocationStart (src/lib/ai/logging/recordInvocation.ts) falls
 * back to this ambient context when a field is omitted, and fails closed
 * (throws in dev/test, degrades to `app_function_key: "unattributed"` +
 * an app_logs error row in production) if no context was ever established
 * at all — the case of a call site forgetting to wrap itself.
 *
 * institutionId is deliberately not carried here (D4) — it's already
 * authoritatively derived from classId at insert time
 * (resolveInstitutionId), and no call site has a classId-less,
 * institution-scoped need for it today.
 */
export interface AiRequestContext {
  userId?: string | null;
  classId?: string | null;
}

export class AiContextMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiContextMissingError";
  }
}

const aiContextStorage = new AsyncLocalStorage<AiRequestContext>();

/** Runs `fn` with `context` ambiently available to getAiContext() anywhere in its async call graph. */
export function runWithAiContext<T>(context: AiRequestContext, fn: () => T): T {
  return aiContextStorage.run(context, fn);
}

/** Returns the ambient context, or `undefined` if no runWithAiContext() is active. */
export function getAiContext(): AiRequestContext | undefined {
  return aiContextStorage.getStore();
}
