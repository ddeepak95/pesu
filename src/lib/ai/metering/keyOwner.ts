import "server-only";

import type { AiConfigSource } from "@/types/aiSettings";

export type KeyOwner = "platform" | "byok";

/**
 * Hand-written TS mirror of SQL's key_owner_from_source (D3,
 * 20260714000000_ai_usage_counters.sql) — needed pre-write, before any
 * ai_invocations row exists to hand to SQL. Documented duplication risk, not
 * eliminated: keep in sync with the SQL function by hand.
 *
 * 'platform'/'env' -> 'platform'; 'institution'/'class' -> 'byok';
 * 'unconfigured' -> 'platform' fail-safe default, mirroring SQL's ELSE branch.
 */
export function keyOwnerFromSource(keySource: AiConfigSource): KeyOwner {
  switch (keySource) {
    case "platform":
    case "env":
      return "platform";
    case "institution":
    case "class":
      return "byok";
    case "unconfigured":
      return "platform";
    default: {
      const _exhaustive: never = keySource;
      return _exhaustive;
    }
  }
}
