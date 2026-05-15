import { DEFAULT_GOOGLE_MODEL } from "@/lib/ai/capabilities/registry";

/** Fixed UUID for platform-scoped rows in `ai_capability_configs`. */
export const PLATFORM_SCOPE_ID = "00000000-0000-4000-8000-000000000001";

/** Institution row storing lock flags only (not shown in capability list UI). */
export const AI_CONFIG_LOCKS_KEY = "__locks__";

export type AiConfigScope = "platform" | "institution" | "class";

export function isAiConfigLocksKey(capabilityKey: string): boolean {
  return capabilityKey === AI_CONFIG_LOCKS_KEY;
}

export function defaultGoogleModelId(): string {
  return DEFAULT_GOOGLE_MODEL;
}
