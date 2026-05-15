import "server-only";

import {
  TEXT_CAPABILITY_KEY,
  type AiCapabilityKey,
} from "@/lib/ai/capabilities/registry";
import {
  resolveModelConfig,
  type ResolveModelConfigResult,
} from "@/lib/ai/credentials/resolve";
import { createServiceRoleClient } from "@/lib/supabase-server";

/** Per warm server instance; not shared across Vercel lambdas or regions. */
const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  result: ResolveModelConfigResult;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ResolveModelConfigResult>>();

function cacheKey(classDbId: string, capabilityKey: AiCapabilityKey): string {
  return `${capabilityKey}:${classDbId}`;
}

function getCached(key: string): ResolveModelConfigResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function setCached(key: string, result: ResolveModelConfigResult): void {
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Resolve model config with in-memory TTL cache (chat and other opt-in callers).
 * Dedupes concurrent resolves for the same class on a warm instance.
 */
export async function getCachedResolveModelConfig(input: {
  classDbId: string;
  capabilityKey?: AiCapabilityKey;
}): Promise<ResolveModelConfigResult> {
  const capabilityKey = input.capabilityKey ?? TEXT_CAPABILITY_KEY;
  const key = cacheKey(input.classDbId, capabilityKey);

  const hit = getCached(key);
  if (hit) return hit;

  let pending = inflight.get(key);
  if (!pending) {
    pending = resolveModelConfig({
      classDbId: input.classDbId,
      capabilityKey,
    })
      .then((result) => {
        setCached(key, result);
        return result;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, pending);
  }

  return pending;
}

export function invalidateModelConfigCache(
  classDbId: string,
  capabilityKey?: AiCapabilityKey,
): void {
  if (capabilityKey) {
    const key = cacheKey(classDbId, capabilityKey);
    cache.delete(key);
    inflight.delete(key);
    return;
  }
  const suffix = `:${classDbId}`;
  for (const key of cache.keys()) {
    if (key.endsWith(suffix)) cache.delete(key);
  }
  for (const key of inflight.keys()) {
    if (key.endsWith(suffix)) inflight.delete(key);
  }
}

export async function invalidateModelConfigCacheForInstitution(
  institutionId: string,
): Promise<void> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("classes")
    .select("id")
    .eq("institution_id", institutionId);
  if (error) throw error;
  for (const row of data ?? []) {
    invalidateModelConfigCache(row.id as string);
  }
}

export function clearModelConfigCache(): void {
  cache.clear();
  inflight.clear();
}
