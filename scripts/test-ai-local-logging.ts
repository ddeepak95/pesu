import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { usesLocalInvocationStorage } from "../src/lib/ai/logging/storagePolicy";
import { writeLocalInvocationJson } from "../src/lib/ai/logging/local";

test("storage defaults to local only in development, with explicit GCS override", () => {
  assert.equal(usesLocalInvocationStorage({ NODE_ENV: "development" }), true);
  assert.equal(usesLocalInvocationStorage({ NODE_ENV: "development", AI_INVOCATION_LOG_STORAGE: "gcs" }), false);
  assert.equal(usesLocalInvocationStorage({ NODE_ENV: "production", AI_INVOCATION_LOG_STORAGE: "local" }), false);
  assert.equal(usesLocalInvocationStorage({ NODE_ENV: "test" }), false);
});

test("local payloads are readable, redact keys, and reject path traversal", async () => {
  const root = await mkdtemp(join(tmpdir(), "ai-local-logging-"));
  const id = "00000000-0000-4000-8000-000000000001";
  try {
    await writeLocalInvocationJson(`local:ai-logs/${id}/request.json`, { apiKey: "secret-value", sdkRequest: { messages: [{ role: "user", content: "Hello" }] } }, root);
    await writeLocalInvocationJson(`local:ai-logs/${id}/response.json`, { status: "failed", error: "Provider unavailable" }, root);
    const request = await readFile(join(root, ".local", "ai-logs", id, "request.json"), "utf8");
    assert.doesNotMatch(request, /secret-value/);
    assert.match(request, /Hello/);
    const response = JSON.parse(await readFile(join(root, ".local", "ai-logs", id, "response.json"), "utf8"));
    assert.equal(response.status, "failed");
    await assert.rejects(writeLocalInvocationJson("local:ai-logs/../../outside.json", {}, root), /Invalid local/);
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith("ai-local-logging-"));
    await rm(root, { recursive: true, force: true });
  }
});
