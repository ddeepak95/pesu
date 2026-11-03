/** Local files are only available in development; deployed builds keep GCS. */
export function usesLocalInvocationStorage(env: { NODE_ENV?: string; AI_INVOCATION_LOG_STORAGE?: string } = process.env): boolean {
  return env.NODE_ENV === "development" && env.AI_INVOCATION_LOG_STORAGE !== "gcs";
}
