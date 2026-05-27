import "server-only";

import type { ProviderId } from "@/lib/ai/catalog/types";
import { PLATFORM_SCOPE_ID } from "@/lib/ai/credentials/constants";
import {
  buildEffectiveCatalogRuntimeState,
  getProviderApiKey,
} from "@/lib/ai/catalog/buildEffectiveRuntime";
import { getCatalogSecretsForScope } from "@/lib/queries/aiCatalog";
import { createServiceRoleClient } from "@/lib/supabase-server";

/** Per warm server instance; not shared across lambdas/regions. */
const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  providerApiKey: string | null;
  expiresAt: number;
};

type SpeechProviderKeyCacheStore = {
  cache: Map<string, CacheEntry>;
  inflight: Map<string, Promise<string | null>>;
};

const globalStore = globalThis as typeof globalThis & {
  __speechProviderKeyCacheStore?: SpeechProviderKeyCacheStore;
};

function getStore(): SpeechProviderKeyCacheStore {
  if (!globalStore.__speechProviderKeyCacheStore) {
    globalStore.__speechProviderKeyCacheStore = {
      cache: new Map(),
      inflight: new Map(),
    };
  }
  return globalStore.__speechProviderKeyCacheStore;
}

function cacheKey(assignmentId: string, providerId: ProviderId): string {
  return `${providerId}:${assignmentId}`;
}

function getCached(key: string): string | null | undefined {
  const { cache } = getStore();
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.providerApiKey;
}

function setCached(key: string, providerApiKey: string | null): void {
  getStore().cache.set(key, {
    providerApiKey,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

async function loadClassAndInstitutionForAssignment(assignmentId: string): Promise<{
  classDbId: string | null;
  institutionId: string | null;
}> {
  const service = createServiceRoleClient();
  const { data: assignment, error: assignmentError } = await service
    .from("assignments")
    .select("class_id")
    .eq("assignment_id", assignmentId)
    .maybeSingle();
  if (assignmentError) throw assignmentError;
  const classDbId = (assignment?.class_id as string | null) ?? null;
  if (!classDbId) {
    return { classDbId: null, institutionId: null };
  }

  const { data: classRow, error: classError } = await service
    .from("classes")
    .select("institution_id")
    .eq("id", classDbId)
    .maybeSingle();
  if (classError) throw classError;

  return {
    classDbId,
    institutionId: (classRow?.institution_id as string | null) ?? null,
  };
}

export async function resolveProviderApiKeyForAssignment(
  assignmentId: string,
  providerId: ProviderId,
): Promise<string | null> {
  const key = cacheKey(assignmentId, providerId);
  const hit = getCached(key);
  if (hit !== undefined) return hit;

  const { inflight } = getStore();
  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      const { classDbId, institutionId } =
        await loadClassAndInstitutionForAssignment(assignmentId);
      if (!classDbId) return null;

      const service = createServiceRoleClient();
      const [platformSecrets, institutionSecrets, classSecrets] = await Promise.all([
        getCatalogSecretsForScope(service, "platform", PLATFORM_SCOPE_ID),
        institutionId
          ? getCatalogSecretsForScope(service, "institution", institutionId)
          : Promise.resolve(null),
        getCatalogSecretsForScope(service, "class", classDbId),
      ]);

      const runtime = buildEffectiveCatalogRuntimeState(
        platformSecrets,
        institutionSecrets,
        classSecrets,
      );
      return getProviderApiKey(runtime, providerId);
    })()
      .then((providerApiKey) => {
        setCached(key, providerApiKey);
        return providerApiKey;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, pending);
  }

  return pending;
}

export function invalidateSpeechProviderKeyCacheForAssignment(
  assignmentId: string,
  providerId?: ProviderId,
): void {
  const { cache, inflight } = getStore();
  if (providerId) {
    const key = cacheKey(assignmentId, providerId);
    cache.delete(key);
    inflight.delete(key);
    return;
  }

  const suffix = `:${assignmentId}`;
  for (const key of cache.keys()) {
    if (key.endsWith(suffix)) cache.delete(key);
  }
  for (const key of inflight.keys()) {
    if (key.endsWith(suffix)) inflight.delete(key);
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
}
