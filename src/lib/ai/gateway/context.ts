/**
 * Request-scoped AI context — dev-docs/ai-usage-metering-plan.md §7.4.
 * Phase 1 ships this as a stub: callers pass an explicit AiCallContext to
 * resolveMeteredModel/resolveMeteredSpeech (model.ts, speech.ts); nothing
 * reads this yet. The full AsyncLocalStorage-backed backstop (fail-closed in
 * dev/test, `app_function_key='unattributed'` + error log in production) is
 * Phase 2 work.
 */
export interface AiRequestContext {
  userId?: string | null;
  classId?: string | null;
  institutionId?: string | null;
}
