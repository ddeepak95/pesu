"use server";

import "server-only";

import { verifySession } from "@/lib/dal";
import { CATALOG_FUNCTIONS } from "@/lib/ai/catalog/data";
import {
  normalizeFunctionBinding,
  resolveInstitutionEffectiveFunctionBinding,
  subFunctionBindingKey,
} from "@/lib/ai/catalog/helpers";
import type {
  AiSettingsScope,
  FunctionBindingState,
  LocalAiSettingsState,
  ProviderId,
} from "@/lib/ai/catalog/types";
import {
  encryptApiKey,
  keyHintFromPlaintext,
} from "@/lib/ai/credentials/crypto";
import {
  assertCanEditClassAiConfig,
  assertCanEditInstitutionAiConfig,
} from "@/lib/ai/credentials/enforce";
import {
  clearModelConfigCache,
  invalidateModelConfigCache,
  invalidateModelConfigCacheForInstitution,
} from "@/lib/ai/credentials/modelConfigCache";
import { getInstitutionAiPolicy } from "@/lib/queries/aiInstitutionSettings";
import { PLATFORM_SCOPE_ID } from "@/lib/ai/credentials/constants";
import {
  deleteFunctionBinding,
  deleteFunctionBindings,
  getCatalogSettingsForScope,
  normalizeCatalogScopeId,
  resetCatalogScope,
  upsertFunctionBinding,
  upsertProviderActivation,
} from "@/lib/queries/aiCatalog";
import { resolveClassSettingsViewer } from "@/lib/settings/classViewerRole";
import type { ViewerRole } from "@/lib/settings/capabilities";

export interface CatalogActionResult {
  ok: boolean;
  error?: string;
}

function ok(): CatalogActionResult {
  return { ok: true };
}

function fail(message: string): CatalogActionResult {
  return { ok: false, error: message };
}

async function resolveViewerForInstitution(
  supabase: Awaited<ReturnType<typeof verifySession>>["supabase"],
  userId: string,
  institutionId: string,
): Promise<ViewerRole> {
  const [superRes, memberRes] = await Promise.all([
    supabase
      .from("platform_super_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("institution_members")
      .select("user_id")
      .eq("institution_id", institutionId)
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle(),
  ]);
  if (!superRes.error && superRes.data) return "super_admin";
  if (!memberRes.error && memberRes.data) return "institution_admin";
  return "viewer";
}

async function loadInstitutionIdForClass(
  supabase: Awaited<ReturnType<typeof verifySession>>["supabase"],
  classDbId: string,
): Promise<{ institutionId: string; classShortId: string } | undefined> {
  const { data, error } = await supabase
    .from("classes")
    .select("institution_id, class_id")
    .eq("id", classDbId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.institution_id) return undefined;
  return {
    institutionId: data.institution_id as string,
    classShortId: data.class_id as string,
  };
}

async function assertPlatformSuperAdmin(
  supabase: Awaited<ReturnType<typeof verifySession>>["supabase"],
  userId: string,
) {
  const { data, error } = await supabase
    .from("platform_super_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error("Only platform super admins may edit platform AI catalog");
  }
}

async function assertCatalogEditAccess(input: {
  supabase: Awaited<ReturnType<typeof verifySession>>["supabase"];
  userId: string;
  scope: AiSettingsScope;
  scopeId: string;
}): Promise<{ institutionId?: string; classShortId?: string }> {
  const scopeId = normalizeCatalogScopeId(input.scope, input.scopeId);

  if (input.scope === "platform") {
    await assertPlatformSuperAdmin(input.supabase, input.userId);
    return {};
  }

  if (input.scope === "institution") {
    const viewerRole = await resolveViewerForInstitution(
      input.supabase,
      input.userId,
      scopeId,
    );
    const institutionPolicy = await getInstitutionAiPolicy(
      input.supabase,
      scopeId,
    );
    assertCanEditInstitutionAiConfig({ viewerRole, institutionPolicy });
    return { institutionId: scopeId };
  }

  const classMeta = await loadInstitutionIdForClass(input.supabase, scopeId);
  if (!classMeta?.institutionId) {
    throw new Error("Class not found");
  }
  const { viewerRole } = await resolveClassSettingsViewer(
    input.supabase,
    input.userId,
    scopeId,
  );
  const institutionPolicy = await getInstitutionAiPolicy(
    input.supabase,
    classMeta.institutionId,
  );
  assertCanEditClassAiConfig({ viewerRole, institutionPolicy });
  return {
    institutionId: classMeta.institutionId,
    classShortId: classMeta.classShortId,
  };
}

/** Invalidate runtime model-config cache only; UI reloads via SWR. */
async function afterCatalogMutation(input: {
  scope: AiSettingsScope;
  institutionId?: string;
  classDbId?: string;
}) {
  clearModelConfigCache();
  if (input.scope === "platform") {
    return;
  }
  if (input.scope === "institution" && input.institutionId) {
    await invalidateModelConfigCacheForInstitution(input.institutionId);
    return;
  }
  if (input.scope === "class" && input.classDbId) {
    invalidateModelConfigCache(input.classDbId);
    if (input.institutionId) {
      await invalidateModelConfigCacheForInstitution(input.institutionId);
    }
  }
}

export async function loadCatalogSettingsAction(
  scope: AiSettingsScope,
  scopeId: string,
): Promise<LocalAiSettingsState> {
  const { supabase } = await verifySession();
  return getCatalogSettingsForScope(supabase, scope, scopeId);
}

export async function activateCatalogProviderAction(input: {
  scope: AiSettingsScope;
  scopeId: string;
  providerId: ProviderId;
  apiKey: string;
}): Promise<CatalogActionResult> {
  try {
    const { user, supabase } = await verifySession();
    const scopeId = normalizeCatalogScopeId(input.scope, input.scopeId);
    const ctx = await assertCatalogEditAccess({
      supabase,
      userId: user.id,
      scope: input.scope,
      scopeId,
    });

    const trimmed = input.apiKey.trim();
    if (!trimmed) {
      return fail("API key is required");
    }

    await upsertProviderActivation(supabase, {
      scope: input.scope,
      scopeId,
      providerId: input.providerId,
      usePlatformDefault: false,
      isActive: true,
      encryptedApiKey: encryptApiKey(trimmed),
      keyHint: keyHintFromPlaintext(trimmed),
      updatedBy: user.id,
    });

    await afterCatalogMutation({
      scope: input.scope,
      institutionId: ctx.institutionId,
      classDbId: input.scope === "class" ? scopeId : undefined,
    });
    return ok();
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function deactivateCatalogProviderAction(input: {
  scope: AiSettingsScope;
  scopeId: string;
  providerId: ProviderId;
}): Promise<CatalogActionResult> {
  try {
    const { user, supabase } = await verifySession();
    const scopeId = normalizeCatalogScopeId(input.scope, input.scopeId);
    const ctx = await assertCatalogEditAccess({
      supabase,
      userId: user.id,
      scope: input.scope,
      scopeId,
    });

    await upsertProviderActivation(supabase, {
      scope: input.scope,
      scopeId,
      providerId: input.providerId,
      usePlatformDefault: input.scope !== "platform",
      isActive: false,
      encryptedApiKey: null,
      keyHint: null,
      updatedBy: user.id,
    });

    await afterCatalogMutation({
      scope: input.scope,
      institutionId: ctx.institutionId,
      classDbId: input.scope === "class" ? scopeId : undefined,
    });
    return ok();
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function setCatalogUsePlatformProviderAction(input: {
  scope: AiSettingsScope;
  scopeId: string;
  providerId: ProviderId;
  usePlatform: boolean;
}): Promise<CatalogActionResult> {
  try {
    const { user, supabase } = await verifySession();
    const scopeId = normalizeCatalogScopeId(input.scope, input.scopeId);

    if (input.scope === "platform") {
      return fail("Parent default toggle does not apply at platform scope");
    }

    const ctx = await assertCatalogEditAccess({
      supabase,
      userId: user.id,
      scope: input.scope,
      scopeId,
    });

    await upsertProviderActivation(supabase, {
      scope: input.scope,
      scopeId,
      providerId: input.providerId,
      usePlatformDefault: input.usePlatform,
      isActive: false,
      encryptedApiKey: null,
      keyHint: null,
      updatedBy: user.id,
    });

    await afterCatalogMutation({
      scope: input.scope,
      institutionId: ctx.institutionId,
      classDbId: input.scope === "class" ? scopeId : undefined,
    });
    return ok();
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function saveCatalogFunctionBindingAction(input: {
  scope: AiSettingsScope;
  scopeId: string;
  bindingKey: string;
  binding: FunctionBindingState;
}): Promise<CatalogActionResult> {
  try {
    const { user, supabase } = await verifySession();
    const scopeId = normalizeCatalogScopeId(input.scope, input.scopeId);
    const binding = normalizeFunctionBinding(input.binding);
    const ctx = await assertCatalogEditAccess({
      supabase,
      userId: user.id,
      scope: input.scope,
      scopeId,
    });

    await upsertFunctionBinding(supabase, {
      scope: input.scope,
      scopeId,
      bindingKey: input.bindingKey,
      providerId: binding.providerId,
      modelId: binding.modelId,
      reasoning: binding.reasoning ?? null,
      updatedBy: user.id,
    });

    await afterCatalogMutation({
      scope: input.scope,
      institutionId: ctx.institutionId,
      classDbId: input.scope === "class" ? scopeId : undefined,
    });
    return ok();
  } catch (err) {
    return fail((err as Error).message);
  }
}

function bindingKeysForParent(parentKey: string): string[] {
  const fn = CATALOG_FUNCTIONS.find((f) => f.key === parentKey);
  const subKeys =
    fn?.subFunctions?.map((sub) =>
      subFunctionBindingKey(parentKey, sub.key),
    ) ?? [];
  return [parentKey, ...subKeys];
}

export async function setCatalogUsePlatformFunctionDefaultAction(input: {
  scope: AiSettingsScope;
  scopeId: string;
  parentKey: string;
  usePlatform: boolean;
}): Promise<CatalogActionResult> {
  try {
    if (input.scope === "platform") {
      return fail("Parent default toggle does not apply at platform scope");
    }

    const { user, supabase } = await verifySession();
    const scopeId = normalizeCatalogScopeId(input.scope, input.scopeId);
    const ctx = await assertCatalogEditAccess({
      supabase,
      userId: user.id,
      scope: input.scope,
      scopeId,
    });

    if (input.usePlatform) {
      await deleteFunctionBindings(
        supabase,
        input.scope,
        scopeId,
        bindingKeysForParent(input.parentKey),
      );
    } else {
      let seedBinding: FunctionBindingState | undefined;
      if (input.scope === "class" && ctx.institutionId) {
        const [institution, platform] = await Promise.all([
          getCatalogSettingsForScope(supabase, "institution", ctx.institutionId),
          getCatalogSettingsForScope(
            supabase,
            "platform",
            PLATFORM_SCOPE_ID,
          ),
        ]);
        seedBinding = resolveInstitutionEffectiveFunctionBinding(
          institution,
          platform,
          input.parentKey,
        );
      } else if (input.scope === "institution") {
        const platform = await getCatalogSettingsForScope(
          supabase,
          "platform",
          PLATFORM_SCOPE_ID,
        );
        seedBinding = platform.functions[input.parentKey];
      }

      if (seedBinding) {
        const binding = normalizeFunctionBinding(seedBinding);
        await upsertFunctionBinding(supabase, {
          scope: input.scope,
          scopeId,
          bindingKey: input.parentKey,
          providerId: binding.providerId,
          modelId: binding.modelId,
          reasoning: binding.reasoning ?? null,
          updatedBy: user.id,
        });
      }
    }

    await afterCatalogMutation({
      scope: input.scope,
      institutionId: ctx.institutionId,
      classDbId: input.scope === "class" ? scopeId : undefined,
    });
    return ok();
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function clearCatalogFunctionBindingAction(input: {
  scope: AiSettingsScope;
  scopeId: string;
  bindingKey: string;
}): Promise<CatalogActionResult> {
  try {
    const { user, supabase } = await verifySession();
    const scopeId = normalizeCatalogScopeId(input.scope, input.scopeId);
    const ctx = await assertCatalogEditAccess({
      supabase,
      userId: user.id,
      scope: input.scope,
      scopeId,
    });

    await deleteFunctionBinding(
      supabase,
      input.scope,
      scopeId,
      input.bindingKey,
    );

    await afterCatalogMutation({
      scope: input.scope,
      institutionId: ctx.institutionId,
      classDbId: input.scope === "class" ? scopeId : undefined,
    });
    return ok();
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function resetCatalogScopeAction(input: {
  scope: AiSettingsScope;
  scopeId: string;
}): Promise<CatalogActionResult> {
  try {
    const { user, supabase } = await verifySession();
    const scopeId = normalizeCatalogScopeId(input.scope, input.scopeId);
    const ctx = await assertCatalogEditAccess({
      supabase,
      userId: user.id,
      scope: input.scope,
      scopeId,
    });

    await resetCatalogScope(supabase, input.scope, scopeId);

    await afterCatalogMutation({
      scope: input.scope,
      institutionId: ctx.institutionId,
      classDbId: input.scope === "class" ? scopeId : undefined,
    });
    return ok();
  } catch (err) {
    return fail((err as Error).message);
  }
}
