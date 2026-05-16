import "server-only";

const AI_LOGS_PREFIX = "ai-logs";

export function aiInvocationStoragePaths(invocationId: string): {
  requestStoragePath: string;
  responseStoragePath: string;
} {
  const base = `${AI_LOGS_PREFIX}/${invocationId}`;
  return {
    requestStoragePath: `${base}/request.json`,
    responseStoragePath: `${base}/response.json`,
  };
}

export const AI_INVOCATION_GCS_PREFIX = AI_LOGS_PREFIX;
