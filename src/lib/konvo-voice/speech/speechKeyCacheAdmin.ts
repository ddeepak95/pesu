import "server-only";

import type { ProviderId } from "@/lib/ai/catalog/types";
import { createServiceRoleClient } from "@/lib/supabase-server";
import type { ProviderApiKeyWithSource } from "./resolveProviderKey";

/**
 * Cache-invalidation/clear helpers, split out of resolveProviderKey.ts
 * (§7.2) so admin flows (AI settings changes) can bust the speech
 * provider-key caches without importing the credential-resolution module
 * itself — that module is gateway-only. Both files independently address the
 * same globalThis-backed Maps by key; neither owns the other.
 */

type CacheEntry = { providerApiKey: string | null; expiresAt: number };
type SpeechProviderKeyCacheStore = {
  cache: Map<string, CacheEntry>;
  inflight: Map<string, Promise<string | null>>;
};
type SpeechProviderKeySourceCacheStore = {
  cache: Map<string, ProviderApiKeyWithSource>;
  inflight: Map<string, Promise<ProviderApiKeyWithSource>>;
};

const globalStore = globalThis as typeof globalThis & {
  __speechProviderKeyCacheStore?: SpeechProviderKeyCacheStore;
  __speechProviderKeySourceCacheStore?: SpeechProviderKeySourceCacheStore;
};

function getStore(): SpeechProviderKeyCacheStore {
  if (!globalStore.__speechProviderKeyCacheStore) {
    globalStore.__speechProviderKeyCacheStore = { cache: new Map(), inflight: new Map() };
  }
  return globalStore.__speechProviderKeyCacheStore;
}

function getSourceStore(): SpeechProviderKeySourceCacheStore {
  if (!globalStore.__speechProviderKeySourceCacheStore) {
    globalStore.__speechProviderKeySourceCacheStore = { cache: new Map(), inflight: new Map() };
  }
  return globalStore.__speechProviderKeySourceCacheStore;
}

function cacheKey(assignmentId: string, providerId: ProviderId): string {
  return `${providerId}:${assignmentId}`;
}

export function invalidateSpeechProviderKeyCacheForAssignment(
  assignmentId: string,
  providerId?: ProviderId,
): void {
  const { cache, inflight } = getStore();
  const { cache: sourceCache, inflight: sourceInflight } = getSourceStore();
  if (providerId) {
    const key = cacheKey(assignmentId, providerId);
    cache.delete(key);
    inflight.delete(key);
    sourceCache.delete(key);
    sourceInflight.delete(key);
    return;
  }

  const suffix = `:${assignmentId}`;
  for (const key of cache.keys()) {
    if (key.endsWith(suffix)) cache.delete(key);
  }
  for (const key of inflight.keys()) {
    if (key.endsWith(suffix)) inflight.delete(key);
  }
  for (const key of sourceCache.keys()) {
    if (key.endsWith(suffix)) sourceCache.delete(key);
  }
  for (const key of sourceInflight.keys()) {
    if (key.endsWith(suffix)) sourceInflight.delete(key);
  }
}

export async function invalidateSpeechProviderKeyCacheForClass(
  classDbId: string,
): Promise<void> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("assignments")
    .select("assignment_id")
    .eq("class_id", classDbId);
  if (error) throw error;

  for (const row of data ?? []) {
    const assignmentId = row.assignment_id as string | null;
    if (assignmentId) {
      invalidateSpeechProviderKeyCacheForAssignment(assignmentId);
    }
  }
}

export async function invalidateSpeechProviderKeyCacheForInstitution(
  institutionId: string,
): Promise<void> {
  const service = createServiceRoleClient();
  const { data: classes, error: classesError } = await service
    .from("classes")
    .select("id")
    .eq("institution_id", institutionId);
  if (classesError) throw classesError;

  for (const row of classes ?? []) {
    const classDbId = row.id as string | null;
    if (classDbId) {
      await invalidateSpeechProviderKeyCacheForClass(classDbId);
    }
  }
}

export function clearSpeechProviderKeyCache(): void {
  const store = getStore();
  store.cache.clear();
  store.inflight.clear();
  const sourceStore = getSourceStore();
  sourceStore.cache.clear();
  sourceStore.inflight.clear();
}
