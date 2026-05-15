"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { verifySession } from "@/lib/dal";
import {
  buildUpsertArgsFromPayload,
  clearAiConfigForScope,
  getInstitutionAiConfigs,
  setInstitutionAiConfigLock,
  upsertAiConfigForScope,
} from "@/lib/queries/aiCapabilityConfigs";
import { PLATFORM_SCOPE_ID } from "@/lib/ai/credentials/constants";
import {
  clearModelConfigCache,
  invalidateModelConfigCache,
  invalidateModelConfigCacheForInstitution,
} from "@/lib/ai/credentials/modelConfigCache";
import {
  encryptApiKey,
  keyHintFromPlaintext,
} from "@/lib/ai/credentials/crypto";
import {
  assertCanEditClassAiConfig,
  assertCanEditInstitutionAiConfig,
  assertCanEditPlatform,
  assertCanToggleAiLock,
  validateUpsertPayload,
} from "@/lib/ai/credentials/enforce";
import {
  asAiCapabilityKey,
  TEXT_CAPABILITY_KEY,
} from "@/lib/ai/capabilities/registry";
import { resolveClassSettingsViewer } from "@/lib/settings/classViewerRole";
import type { ViewerRole } from "@/lib/settings/capabilities";
import type { UpsertAiConfigPayload } from "@/types/aiCapabilityConfig";

export interface AiConfigActionResult {
  ok: boolean;
  error?: string;
}

function ok(): AiConfigActionResult {
  return { ok: true };
}

function fail(message: string): AiConfigActionResult {
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

function revalidatePlatformAi() {
  revalidatePath("/platform");
  revalidatePath("/platform/ai-settings");
}

function revalidateInstitution(institutionId: string) {
  revalidatePath("/platform");
  revalidatePath(`/platform/institutions/${institutionId}`);
  revalidatePath(`/admin/institutions/${institutionId}`);
}

function revalidateClass(classShortId: string | null) {
  if (classShortId) {
    revalidatePath(`/teacher/classes/${classShortId}/settings`);
  }
}

async function loadExistingSecret(
  supabase: Awaited<ReturnType<typeof verifySession>>["supabase"],
  scope: "platform" | "institution" | "class",
  scopeId: string,
  capabilityKey: string,
) {
  const { data, error } = await supabase
    .from("ai_capability_configs")
    .select("encrypted_api_key, key_hint")
    .eq("scope", scope)
    .eq("scope_id", scopeId)
    .eq("capability_key", capabilityKey)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    encryptedApiKey: data.encrypted_api_key as string | null,
    keyHint: data.key_hint as string | null,
  };
}

function encryptedFromPayload(
  payload: UpsertAiConfigPayload,
  existing: { encryptedApiKey: string | null; keyHint: string | null } | null,
): { ciphertext: string; hint: string } | null {
  if (payload.usePlatformDefault) return null;
  const key = payload.apiKey?.trim();
  if (key) {
    return {
      ciphertext: encryptApiKey(key),
      hint: keyHintFromPlaintext(key),
    };
  }
  if (existing?.encryptedApiKey) {
    return {
      ciphertext: existing.encryptedApiKey,
      hint: existing.keyHint ?? "****",
    };
  }
  return null;
}

export async function upsertPlatformAiConfigAction(input: {
  capabilityKey?: string;
  payload: UpsertAiConfigPayload;
}): Promise<AiConfigActionResult> {
  try {
    const { user, supabase } = await verifySession();
    const { data: superRow, error: superErr } = await supabase
      .from("platform_super_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (superErr) throw superErr;
    assertCanEditPlatform(superRow ? "super_admin" : "viewer");
    const capabilityKey = asAiCapabilityKey(
      input.capabilityKey ?? TEXT_CAPABILITY_KEY,
    );
    const payload = validateUpsertPayload(capabilityKey, input.payload);
    const existing = await loadExistingSecret(
      supabase,
      "platform",
      PLATFORM_SCOPE_ID,
      capabilityKey,
    );
    const enc = encryptedFromPayload(payload, existing);
    const args = buildUpsertArgsFromPayload(
      "platform",
      PLATFORM_SCOPE_ID,
      capabilityKey,
      user.id,
      payload,
      existing,
      enc,
    );
    await upsertAiConfigForScope(supabase, args);
    clearModelConfigCache();
    revalidatePlatformAi();
    return ok();
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function upsertInstitutionAiConfigAction(input: {
  institutionId: string;
  capabilityKey?: string;
  payload: UpsertAiConfigPayload;
}): Promise<AiConfigActionResult> {
  try {
    const { user, supabase } = await verifySession();
    const viewerRole = await resolveViewerForInstitution(
      supabase,
      user.id,
      input.institutionId,
    );
    const bundle = await getInstitutionAiConfigs(supabase, input.institutionId);
    assertCanEditInstitutionAiConfig({
      viewerRole,
      institutionPolicy: bundle.institutionPolicy,
    });
    const capabilityKey = asAiCapabilityKey(
      input.capabilityKey ?? TEXT_CAPABILITY_KEY,
    );
    const payload = validateUpsertPayload(
      capabilityKey,
      input.payload,
      bundle.institutionPolicy,
    );
    const existing = await loadExistingSecret(
      supabase,
      "institution",
      input.institutionId,
      capabilityKey,
    );
    const enc = encryptedFromPayload(payload, existing);
    const args = buildUpsertArgsFromPayload(
      "institution",
      input.institutionId,
      capabilityKey,
      user.id,
      payload,
      existing,
      enc,
    );
    await upsertAiConfigForScope(supabase, args);
    await invalidateModelConfigCacheForInstitution(input.institutionId);
    revalidateInstitution(input.institutionId);
    return ok();
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function upsertClassAiConfigAction(input: {
  classDbId: string;
  classShortId: string | null;
  capabilityKey?: string;
  payload: UpsertAiConfigPayload;
}): Promise<AiConfigActionResult> {
  try {
    const { user, supabase } = await verifySession();
    const { viewerRole, institutionId } = await resolveClassSettingsViewer(
      supabase,
      user.id,
      input.classDbId,
    );
    const bundle = await getInstitutionAiConfigs(supabase, institutionId);
    assertCanEditClassAiConfig({
      viewerRole,
      institutionPolicy: bundle.institutionPolicy,
    });
    const capabilityKey = asAiCapabilityKey(
      input.capabilityKey ?? TEXT_CAPABILITY_KEY,
    );
    const payload = validateUpsertPayload(capabilityKey, input.payload);
    const existing = await loadExistingSecret(
      supabase,
      "class",
      input.classDbId,
      capabilityKey,
    );
    const enc = encryptedFromPayload(payload, existing);
    const args = buildUpsertArgsFromPayload(
      "class",
      input.classDbId,
      capabilityKey,
      user.id,
      payload,
      existing,
      enc,
    );
    await upsertAiConfigForScope(supabase, args);
    invalidateModelConfigCache(input.classDbId, capabilityKey);
    revalidateClass(input.classShortId);
    return ok();
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function clearClassAiConfigOverrideAction(input: {
  classDbId: string;
  classShortId: string | null;
  capabilityKey?: string;
}): Promise<AiConfigActionResult> {
  try {
    const { user, supabase } = await verifySession();
    const { viewerRole, institutionId } = await resolveClassSettingsViewer(
      supabase,
      user.id,
      input.classDbId,
    );
    const bundle = await getInstitutionAiConfigs(supabase, institutionId);
    assertCanEditClassAiConfig({
      viewerRole,
      institutionPolicy: bundle.institutionPolicy,
    });
    const capabilityKey = asAiCapabilityKey(
      input.capabilityKey ?? TEXT_CAPABILITY_KEY,
    );
    await clearAiConfigForScope(
      supabase,
      "class",
      input.classDbId,
      capabilityKey,
    );
    invalidateModelConfigCache(input.classDbId, capabilityKey);
    revalidateClass(input.classShortId);
    return ok();
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function setInstitutionAiConfigLocksAction(input: {
  institutionId: string;
  lock:
    | "allow_admin_edit"
    | "allow_child_override"
    | "allow_use_platform_defaults";
  enabled: boolean;
}): Promise<AiConfigActionResult> {
  try {
    const { user, supabase } = await verifySession();
    const viewerRole = await resolveViewerForInstitution(
      supabase,
      user.id,
      input.institutionId,
    );
    const bundle = await getInstitutionAiConfigs(supabase, input.institutionId);
    assertCanToggleAiLock({
      viewerRole,
      lock: input.lock,
      institutionPolicy: bundle.institutionPolicy,
    });
    await setInstitutionAiConfigLock(
      supabase,
      input.institutionId,
      input.lock,
      input.enabled,
      user.id,
      bundle.institutionPolicy,
    );
    await invalidateModelConfigCacheForInstitution(input.institutionId);
    revalidateInstitution(input.institutionId);
    return ok();
  } catch (err) {
    return fail((err as Error).message);
  }
}
