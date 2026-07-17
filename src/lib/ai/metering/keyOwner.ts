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
 * BYOK usage — an institution's or class's own API key — never touches the
 * institution pool (product decision 2026-07-16): the provider bills the key
 * owner directly. A class cap wallet counts BYOK usage against the class
 * limit per its count_institution_byok (default on) / count_class_byok
 * (default off) flags (product decision 2026-07-17), in which case the class
 * cap alone is debited and gated. Invocations and usage counters are always
 * recorded for visibility.
 */
export function isByokSource(
  keySource: AiConfigSource,
): keySource is "institution" | "class" {
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
