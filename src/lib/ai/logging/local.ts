import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { redactSecrets } from "./serialize";

/** Accept only logger-generated paths, never arbitrary filesystem destinations. */
export async function writeLocalInvocationJson(storagePath: string, payload: unknown, projectRoot = process.cwd()): Promise<void> {
  if (!/^local:ai-logs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(request|response)\.json$/i.test(storagePath)) {
    throw new Error("Invalid local invocation storage path");
  }
  const destination = join(projectRoot, ".local", ...storagePath.slice("local:".length).split("/"));
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(redactSecrets(payload), null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
}
