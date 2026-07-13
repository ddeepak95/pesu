import "server-only";

import type { ProviderId } from "@/lib/ai/catalog/types";
import { PLATFORM_SCOPE_ID } from "@/lib/ai/credentials/constants";
import {
  buildEffectiveCatalogRuntimeState,
  getProviderApiKey,
  getProviderApiKeySource,
} from "@/lib/ai/catalog/buildEffectiveRuntime";
import { getCatalogSecretsForScope } from "@/lib/queries/aiCatalog";
import { createServiceRoleClient } from "@/lib/supabase-server";
import type { AiConfigSource } from "@/types/aiSettings";

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

export interface ProviderApiKeyWithSource {
  apiKey: string | null;
  keySource: AiConfigSource;
}

type SpeechProviderKeySourceCacheStore = {
  cache: Map<string, ProviderApiKeyWithSource>;
  inflight: Map<string, Promise<ProviderApiKeyWithSource>>;
};

const globalSourceStore = globalThis as typeof globalThis & {
  __speechProviderKeySourceCacheStore?: SpeechProviderKeySourceCacheStore;
};

function getSourceStore(): SpeechProviderKeySourceCacheStore {
  if (!globalSourceStore.__speechProviderKeySourceCacheStore) {
    globalSourceStore.__speechProviderKeySourceCacheStore = {
      cache: new Map(),
      inflight: new Map(),
    };
  }
  return globalSourceStore.__speechProviderKeySourceCacheStore;
}

/**
 * Same resolution as resolveProviderApiKeyForAssignment, but also reports
 * which scope supplied the key (class/institution -> BYOK; platform/env ->
 * platform-paid) — needed by the gateway to derive ai_key_source /
 * key_owner for metering (§5.0, §7.1, §7.2). Gateway-internal only.
 */
export async function resolveProviderApiKeyWithSourceForAssignment(
  assignmentId: string,
  providerId: ProviderId,
): Promise<ProviderApiKeyWithSource> {
  const key = cacheKey(assignmentId, providerId);
  const { cache, inflight } = getSourceStore();

  const hit = cache.get(key);
  if (hit) return hit;

  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      const { classDbId, institutionId } =
        await loadClassAndInstitutionForAssignment(assignmentId);
      if (!classDbId) {
        return { apiKey: null, keySource: "env" as AiConfigSource };
      }

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
      return {
        apiKey: getProviderApiKey(runtime, providerId),
        keySource: getProviderApiKeySource(runtime, providerId),
      };
    })()
      .then((result) => {
        cache.set(key, result);
        return result;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, pending);
  }

  return pending;
}

// Cache invalidation/clear helpers live in speechKeyCacheAdmin.ts — split out
// so admin flows (AI settings changes) don't need to import this
// credential-resolution module, which the gateway boundary (§7.2) restricts
// to src/lib/ai/gateway/**. Both files address the same globalThis-backed
// stores by key, so no cross-file export is needed.
