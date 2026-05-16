import type { AiSettingsScope, ProviderId, SavedModelReasoningConfig } from "@/lib/ai/catalog/types";

export type CatalogDbScope = AiSettingsScope;

export interface AiProviderActivationRow {
  scope: CatalogDbScope;
  scope_id: string;
  provider_id: ProviderId;
  use_platform_default: boolean;
  is_active: boolean;
  encrypted_api_key: string | null;
  key_hint: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface AiFunctionBindingRow {
  scope: CatalogDbScope;
  scope_id: string;
  binding_key: string;
  provider_id: ProviderId;
  model_id: string;
  reasoning_json: SavedModelReasoningConfig | null;
  updated_by: string | null;
  updated_at: string;
}

export interface CatalogScopeSecrets {
  providers: AiProviderActivationRow[];
  bindings: AiFunctionBindingRow[];
}
