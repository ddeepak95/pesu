import "server-only";
import { usesLocalInvocationStorage } from "./storagePolicy";

export async function storeInvocationJson(storagePath: string, payload: unknown): Promise<void> {
  if (storagePath.startsWith("local:")) {
    if (!usesLocalInvocationStorage()) throw new Error("Local invocation logging is only available in development");
    const { writeLocalInvocationJson } = await import("./local");
    await writeLocalInvocationJson(storagePath, payload);
    return;
  }
  const { uploadInvocationJson } = await import("./gcs");
  await uploadInvocationJson(storagePath, payload);
}
