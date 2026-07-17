import "server-only";

import type { AiConfigSource } from "@/types/aiSettings";

/**
 * The metering-relevant granularity of an ai_key_source: whose API key served
 * the call. Matches SQL's normalize_key_source
 * (20260714000000_ai_usage_counters.sql) and the ai_usage_counters.key_source
 * column — 'env' and unknown values normalize to 'platform'.
 */
export type NormalizedKeySource = "platform" | "institution" | "class";

/**
 * BYOK usage — an institution's or class's own API key — is fully unmetered
 * (product decision 2026-07-16): no wallet, no gating, no debit; the provider
 * bills the key owner directly. Invocations and usage counters are still
 * recorded for visibility.
 */
export function isByokSource(keySource: AiConfigSource): boolean {
  return keySource === "institution" || keySource === "class";
}

/**
 * Hand-written TS mirror of SQL's normalize_key_source (D3,
 * 20260714000000_ai_usage_counters.sql) — needed pre-write, before any
 * ai_invocations row exists to hand to SQL. Documented duplication risk, not
 * eliminated: keep in sync with the SQL function by hand.
 *
 * 'institution'/'class' pass through; 'platform'/'env' -> 'platform';
 * 'unconfigured' -> 'platform' fail-safe default, mirroring SQL's ELSE branch.
 */
export function normalizeKeySource(keySource: AiConfigSource): NormalizedKeySource {
  switch (keySource) {
    case "institution":
    case "class":
      return keySource;
    case "platform":
    case "env":
    case "unconfigured":
      return "platform";
    default: {
      const _exhaustive: never = keySource;
      return _exhaustive;
    }
  }
}
