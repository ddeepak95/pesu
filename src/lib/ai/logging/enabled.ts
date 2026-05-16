import "server-only";

/** When false, AI routes skip invocation rows and GCS uploads. */
export function isAiInvocationLoggingEnabled(): boolean {
  return process.env.AI_INVOCATION_LOGGING_ENABLED === "true";
}
