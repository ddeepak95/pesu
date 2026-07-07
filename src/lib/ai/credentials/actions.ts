"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { verifySession } from "@/lib/dal";
import { assertCanToggleAiLock } from "@/lib/ai/credentials/enforce";
import {
  clearModelConfigCache,
  invalidateModelConfigCacheForInstitution,
} from "@/lib/ai/credentials/modelConfigCache";
import {
  clearSpeechProviderKeyCache,
  invalidateSpeechProviderKeyCacheForInstitution,
} from "@/lib/konvo-voice/speech/resolveProviderKey";
import {
  getInstitutionAiPolicy,
  setInstitutionAiPolicyLock,
} from "@/lib/queries/aiInstitutionSettings";
import { forceProvidersOffPlatformDefault } from "@/lib/queries/aiCatalog";
import type { ViewerRole } from "@/lib/settings/capabilities";

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

function revalidateInstitution(institutionId: string) {
  revalidatePath("/platform");
  revalidatePath(`/platform/institutions/${institutionId}`);
  revalidatePath(`/admin/institutions/${institutionId}`);
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
    const institutionPolicy = await getInstitutionAiPolicy(
      supabase,
      input.institutionId,
    );
    assertCanToggleAiLock({
      viewerRole,
      lock: input.lock,
      institutionPolicy,
    });
    await setInstitutionAiPolicyLock(
      supabase,
      input.institutionId,
      input.lock,
      input.enabled,
      user.id,
      institutionPolicy,
    );
    if (input.lock === "allow_use_platform_defaults" && !input.enabled) {
      await forceProvidersOffPlatformDefault(
        supabase,
        "institution",
        input.institutionId,
        user.id,
      );
    }
    clearModelConfigCache();
    clearSpeechProviderKeyCache();
    await invalidateModelConfigCacheForInstitution(input.institutionId);
    await invalidateSpeechProviderKeyCacheForInstitution(input.institutionId);
    revalidateInstitution(input.institutionId);
    return ok();
  } catch (err) {
    return fail((err as Error).message);
  }
}
