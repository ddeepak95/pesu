import "server-only";

import type { AppFunctionKey } from "@/lib/ai/catalog/appFunctions";
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

type ModelConfigCacheStore = {
  cache: Map<string, CacheEntry>;
  inflight: Map<string, Promise<ResolveModelConfigResult>>;
};

const globalStore = globalThis as typeof globalThis & {
  __modelConfigCacheStore?: ModelConfigCacheStore;
};

function getStore(): ModelConfigCacheStore {
  if (!globalStore.__modelConfigCacheStore) {
    globalStore.__modelConfigCacheStore = {
      cache: new Map(),
      inflight: new Map(),
    };
  }
  return globalStore.__modelConfigCacheStore;
}

function cacheKey(classDbId: string, appFunctionKey: AppFunctionKey): string {
  return `${appFunctionKey}:${classDbId}`;
}

function getCached(key: string): ResolveModelConfigResult | null {
  const { cache } = getStore();
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function setCached(key: string, result: ResolveModelConfigResult): void {
  getStore().cache.set(key, {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Resolve model config with in-memory TTL cache (chat and other opt-in callers).
 */
export async function getCachedResolveModelConfig(input: {
  classDbId: string;
  appFunctionKey: AppFunctionKey;
}): Promise<ResolveModelConfigResult> {
  const key = cacheKey(input.classDbId, input.appFunctionKey);

  const hit = getCached(key);
  if (hit) return hit;

  const { inflight } = getStore();
  let pending = inflight.get(key);
  if (!pending) {
    pending = resolveModelConfig({
      classDbId: input.classDbId,
      appFunctionKey: input.appFunctionKey,
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
  appFunctionKey?: AppFunctionKey,
): void {
  const { cache, inflight } = getStore();
  if (appFunctionKey) {
    const k = cacheKey(classDbId, appFunctionKey);
    cache.delete(k);
    inflight.delete(k);
    return;
  }
  const suffix = `:${classDbId}`;
  for (const k of cache.keys()) {
    if (k.endsWith(suffix)) cache.delete(k);
  }
  for (const k of inflight.keys()) {
    if (k.endsWith(suffix)) inflight.delete(k);
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
  const store = getStore();
  store.cache.clear();
  store.inflight.clear();
}
