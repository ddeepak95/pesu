import type { AiCapabilityKey, AiProvider } from "@/lib/ai/capabilities/registry";

export type { AiCapabilityKey, AiProvider };

export type AiConfigSource =
  | "platform"
  | "institution"
  | "class"
  | "env"
  | "unconfigured";

export interface AiInstitutionPolicy {
  allowAdminEdit: boolean;
  allowChildOverride: boolean;
  /** When false, institution cannot use platform defaults; must set custom keys. */
  allowUsePlatformDefaults: boolean;
}

/** Serializable metadata for one capability at a resolved scope (no secrets). */
export interface EffectiveAiCapabilityMeta {
  capabilityKey: AiCapabilityKey;
  source: AiConfigSource;
  usePlatformDefault: boolean;
  hasClassOverride: boolean;
  provider: AiProvider | null;
  modelId: string | null;
  keyHint: string | null;
  hasKey: boolean;
}

export type EffectiveAiConfigs = {
  capabilities: Record<AiCapabilityKey, EffectiveAiCapabilityMeta>;
  institutionPolicy: AiInstitutionPolicy;
};

/** Row shape from `ai_capability_configs_meta` view. */
export interface AiCapabilityConfigMetaRow {
  scope: "platform" | "institution" | "class";
  scope_id: string;
  capability_key: string;
  use_platform_default: boolean;
  provider: AiProvider | null;
  model_id: string | null;
  key_hint: string | null;
  allow_admin_edit: boolean;
  allow_child_override: boolean;
  allow_use_platform_defaults: boolean;
  updated_by: string | null;
  updated_at: string;
}

/** Full row including ciphertext — server-only reads. */
export interface AiCapabilityConfigSecretRow extends AiCapabilityConfigMetaRow {
  encrypted_api_key: string | null;
}

export interface UpsertAiConfigPayload {
  usePlatformDefault: boolean;
  provider?: AiProvider;
  modelId?: string;
  /** Plaintext key; omit or empty to keep existing on update. */
  apiKey?: string;
}

export interface AiConfigReadiness {
  showClassBanner: boolean;
  platformConfigured: boolean;
  classReady: boolean;
  allowUsePlatformDefaults: boolean;
}
