import "server-only";

/**
 * Gates GCS debug-payload capture only (request.json / response.json).
 * The ai_invocations row itself is always written regardless of this flag —
 * it's the system of record for billing/usage, not a debug artifact (§6 of
 * dev-docs/ai-usage-metering-plan.md). Conceptually this is now
 * AI_INVOCATION_PAYLOAD_CAPTURE; kept as the same env var name to avoid a
 * deploy-config rename across environments.
 */
export function isAiInvocationLoggingEnabled(): boolean {
  return process.env.AI_INVOCATION_LOGGING_ENABLED === "true";
}
