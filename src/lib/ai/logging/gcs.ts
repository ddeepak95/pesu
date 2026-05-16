import "server-only";

import { getStorageBucket } from "@/lib/firebase-admin";

export async function uploadInvocationJson(
  storagePath: string,
  payload: unknown,
): Promise<void> {
  const bucket = getStorageBucket();
  const file = bucket.file(storagePath);
  const body = JSON.stringify(payload, null, 2);
  await file.save(body, {
    contentType: "application/json",
    resumable: false,
    metadata: {
      cacheControl: "private, max-age=0",
    },
  });
}
