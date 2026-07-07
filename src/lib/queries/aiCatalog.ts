import type { SupabaseClient } from "@supabase/supabase-js";

import { CATALOG_PROVIDER_IDS } from "@/lib/ai/catalog/data";
import { createDefaultLocalAiSettings } from "@/lib/ai/catalog/defaults";
import { normalizeFunctionBinding } from "@/lib/ai/catalog/helpers";
import type {
  AiSettingsScope,
  FunctionBindingState,
  LocalAiSettingsState,
  ProviderActivationState,
  ProviderId,
  SavedModelReasoningConfig,
} from "@/lib/ai/catalog/types";
import { PLATFORM_SCOPE_ID, type AiConfigScope } from "@/lib/ai/credentials/constants";
import type {
  AiFunctionBindingRow,
  AiProviderActivationRow,
  CatalogScopeSecrets,
} from "@/types/aiCatalog";

const PROVIDER_COLUMNS =
  "scope, scope_id, provider_id, use_platform_default, is_active, encrypted_api_key, key_hint, updated_by, updated_at";

const BINDING_COLUMNS =
  "scope, scope_id, binding_key, provider_id, model_id, reasoning_json, updated_by, updated_at";

/** Normalize UI scope id (e.g. "platform") to DB uuid. */
export function normalizeCatalogScopeId(
  scope: AiSettingsScope,
  scopeId: string,
): string {
  if (scope === "platform") {
    if (scopeId === "platform" || scopeId === PLATFORM_SCOPE_ID) {
      return PLATFORM_SCOPE_ID;
    }
  }
  return scopeId;
}

export function catalogScopeToDbScope(scope: AiSettingsScope): AiConfigScope {
  return scope;
}

export async function listProviderActivationsForScope(
  supabase: SupabaseClient,
  scope: AiSettingsScope,
  scopeId: string,
): Promise<AiProviderActivationRow[]> {
  const normalizedId = normalizeCatalogScopeId(scope, scopeId);
  const { data, error } = await supabase
    .from("ai_provider_activations")
    .select(PROVIDER_COLUMNS)
    .eq("scope", catalogScopeToDbScope(scope))
    .eq("scope_id", normalizedId);
  if (error) throw error;
  return (data ?? []) as AiProviderActivationRow[];
}

export async function listFunctionBindingsForScope(
  supabase: SupabaseClient,
  scope: AiSettingsScope,
  scopeId: string,
): Promise<AiFunctionBindingRow[]> {
  const normalizedId = normalizeCatalogScopeId(scope, scopeId);
  const { data, error } = await supabase
    .from("ai_function_bindings")
    .select(BINDING_COLUMNS)
    .eq("scope", catalogScopeToDbScope(scope))
    .eq("scope_id", normalizedId);
  if (error) throw error;
  return (data ?? []) as AiFunctionBindingRow[];
}

function rowToProviderState(
  row: AiProviderActivationRow | undefined,
  scope: AiSettingsScope,
): ProviderActivationState {
  const base =
    scope === "platform"
      ? {
          isActive: false,
          apiKey: "",
          keyHint: null,
          usePlatformDefault: false,
        }
      : {
          isActive: false,
          apiKey: "",
          keyHint: null,
          usePlatformDefault: true,
        };
  if (!row) return base;
  return {
    isActive: row.is_active,
    apiKey: "",
    keyHint: row.key_hint,
    usePlatformDefault: row.use_platform_default,
  };
}

function rowsToSettingsState(
  scope: AiSettingsScope,
  providerRows: AiProviderActivationRow[],
  bindingRows: AiFunctionBindingRow[],
): LocalAiSettingsState {
  const base = createDefaultLocalAiSettings(scope);
  const providers = { ...base.providers };
  for (const id of CATALOG_PROVIDER_IDS) {
    const row = providerRows.find((r) => r.provider_id === id);
    providers[id] = rowToProviderState(row, scope);
  }
  const functions: Record<string, FunctionBindingState> = {};
  for (const row of bindingRows) {
    functions[row.binding_key] = normalizeFunctionBinding({
      providerId: row.provider_id,
      modelId: row.model_id,
      reasoning: row.reasoning_json ?? undefined,
    });
  }
  return { providers, functions };
}

export async function getCatalogSettingsForScope(
  supabase: SupabaseClient,
  scope: AiSettingsScope,
  scopeId: string,
): Promise<LocalAiSettingsState> {
  const [providerRows, bindingRows] = await Promise.all([
    listProviderActivationsForScope(supabase, scope, scopeId),
    listFunctionBindingsForScope(supabase, scope, scopeId),
  ]);
  return rowsToSettingsState(scope, providerRows, bindingRows);
}

export async function getCatalogSecretsForScope(
  supabase: SupabaseClient,
  scope: AiSettingsScope,
  scopeId: string,
): Promise<CatalogScopeSecrets> {
  const [providers, bindings] = await Promise.all([
    listProviderActivationsForScope(supabase, scope, scopeId),
    listFunctionBindingsForScope(supabase, scope, scopeId),
  ]);
  return { providers, bindings };
}

export interface UpsertProviderActivationArgs {
  scope: AiSettingsScope;
  scopeId: string;
  providerId: ProviderId;
  usePlatformDefault: boolean;
  isActive: boolean;
  encryptedApiKey: string | null;
  keyHint: string | null;
  updatedBy: string;
}

export async function upsertProviderActivation(
  supabase: SupabaseClient,
  args: UpsertProviderActivationArgs,
): Promise<void> {
  const scopeId = normalizeCatalogScopeId(args.scope, args.scopeId);
  const { error } = await supabase.from("ai_provider_activations").upsert(
    {
      scope: catalogScopeToDbScope(args.scope),
      scope_id: scopeId,
      provider_id: args.providerId,
      use_platform_default: args.usePlatformDefault,
      is_active: args.isActive,
      encrypted_api_key: args.encryptedApiKey,
      key_hint: args.keyHint,
      updated_by: args.updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "scope,scope_id,provider_id" },
  );
  if (error) throw error;
}

export interface UpsertFunctionBindingArgs {
  scope: AiSettingsScope;
  scopeId: string;
  bindingKey: string;
  providerId: ProviderId;
  modelId: string;
  reasoning: SavedModelReasoningConfig | null;
  updatedBy: string;
}

export async function upsertFunctionBinding(
  supabase: SupabaseClient,
  args: UpsertFunctionBindingArgs,
): Promise<void> {
  const scopeId = normalizeCatalogScopeId(args.scope, args.scopeId);
  const { error } = await supabase.from("ai_function_bindings").upsert(
    {
      scope: catalogScopeToDbScope(args.scope),
      scope_id: scopeId,
      binding_key: args.bindingKey,
      provider_id: args.providerId,
      model_id: args.modelId,
      reasoning_json: args.reasoning ?? null,
      updated_by: args.updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "scope,scope_id,binding_key" },
  );
  if (error) throw error;
}

export async function deleteFunctionBinding(
  supabase: SupabaseClient,
  scope: AiSettingsScope,
  scopeId: string,
  bindingKey: string,
): Promise<void> {
  await deleteFunctionBindings(supabase, scope, scopeId, [bindingKey]);
}

export async function deleteFunctionBindings(
  supabase: SupabaseClient,
  scope: AiSettingsScope,
  scopeId: string,
  bindingKeys: string[],
): Promise<void> {
  if (bindingKeys.length === 0) return;
  const normalizedId = normalizeCatalogScopeId(scope, scopeId);
  const { error } = await supabase
    .from("ai_function_bindings")
    .delete()
    .eq("scope", catalogScopeToDbScope(scope))
    .eq("scope_id", normalizedId)
    .in("binding_key", bindingKeys);
  if (error) throw error;
}

/**
 * Force every provider at this scope off its parent's default key. Used when
 * a platform super admin revokes `allow_use_platform_defaults` for an
 * institution — providers previously relying on the implicit "no row means
 * inherit" default must be pinned to `false` so the policy takes effect
 * immediately, not just for future toggles.
 */
export async function forceProvidersOffPlatformDefault(
  supabase: SupabaseClient,
  scope: AiSettingsScope,
  scopeId: string,
  updatedBy: string,
): Promise<void> {
  const normalizedId = normalizeCatalogScopeId(scope, scopeId);
  const existingRows = await listProviderActivationsForScope(
    supabase,
    scope,
    normalizedId,
  );
  const existingById = new Map(
    existingRows.map((row) => [row.provider_id, row] as const),
  );

  const rows = CATALOG_PROVIDER_IDS.filter((id) => {
    const existing = existingById.get(id);
    return !existing || existing.use_platform_default;
  }).map((id) => {
    const existing = existingById.get(id);
    return {
      scope: catalogScopeToDbScope(scope),
      scope_id: normalizedId,
      provider_id: id,
      use_platform_default: false,
      is_active: existing?.is_active ?? false,
      encrypted_api_key: existing?.encrypted_api_key ?? null,
      key_hint: existing?.key_hint ?? null,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    };
  });
  if (rows.length === 0) return;

  const { error } = await supabase
    .from("ai_provider_activations")
    .upsert(rows, { onConflict: "scope,scope_id,provider_id" });
  if (error) throw error;
}

export async function resetCatalogScope(
  supabase: SupabaseClient,
  scope: AiSettingsScope,
  scopeId: string,
): Promise<void> {
  const normalizedId = normalizeCatalogScopeId(scope, scopeId);
  const dbScope = catalogScopeToDbScope(scope);
  const [pErr, bErr] = await Promise.all([
    supabase
      .from("ai_provider_activations")
      .delete()
      .eq("scope", dbScope)
      .eq("scope_id", normalizedId),
    supabase
      .from("ai_function_bindings")
      .delete()
      .eq("scope", dbScope)
      .eq("scope_id", normalizedId),
  ]);
  if (pErr.error) throw pErr.error;
  if (bErr.error) throw bErr.error;
}
