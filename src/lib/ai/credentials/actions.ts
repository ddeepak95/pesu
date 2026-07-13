"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { verifySession } from "@/lib/dal";
import {
  assertCanToggleAiLock,
  assertCanToggleClassAiOverride,
} from "@/lib/ai/credentials/enforce";
import {
  clearModelConfigCache,
  invalidateModelConfigCache,
  invalidateModelConfigCacheForInstitution,
} from "@/lib/ai/credentials/modelConfigCache";
import {
  clearSpeechProviderKeyCache,
  invalidateSpeechProviderKeyCacheForClass,
  invalidateSpeechProviderKeyCacheForInstitution,
} from "@/lib/konvo-voice/speech/speechKeyCacheAdmin";
import {
  getInstitutionAiPolicy,
  setInstitutionAiPolicyLock,
} from "@/lib/queries/aiInstitutionSettings";
import { setClassAiOverride } from "@/lib/queries/aiClassSettings";
import {
  forceProvidersOffPlatformDefault,
  resetCatalogScope,
} from "@/lib/queries/aiCatalog";
import { resolveClassSettingsViewer } from "@/lib/settings/classViewerRole";
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
  lock: "allow_admin_edit" | "allow_use_platform_defaults";
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

export async function setClassAiOverrideAction(input: {
  classDbId: string;
  classShortId?: string | null;
  enabled: boolean;
}): Promise<AiConfigActionResult> {
  try {
    const { user, supabase } = await verifySession();
    const { viewerRole, institutionId } = await resolveClassSettingsViewer(
      supabase,
      user.id,
      input.classDbId,
    );
    const institutionPolicy = await getInstitutionAiPolicy(
      supabase,
      institutionId,
    );
    assertCanToggleClassAiOverride({
      viewerRole,
      enabled: input.enabled,
      institutionPolicy,
    });
    await setClassAiOverride(supabase, input.classDbId, input.enabled, user.id);

    // Revoking override permission also resets the class back to inheriting
    // institution/platform defaults — otherwise a teacher's prior edits would
    // silently keep taking effect even after they lost the ability to change
    // them further.
    if (!input.enabled) {
      await resetCatalogScope(supabase, "class", input.classDbId);
    }

    clearModelConfigCache();
    clearSpeechProviderKeyCache();
    invalidateModelConfigCache(input.classDbId);
    await invalidateSpeechProviderKeyCacheForClass(input.classDbId);

    revalidatePath(`/admin/institutions/${institutionId}/classes/${input.classDbId}`);
    revalidatePath(`/platform/institutions/${institutionId}/classes/${input.classDbId}`);
    if (input.classShortId) {
      revalidatePath(`/teacher/classes/${input.classShortId}/settings`);
    }
    return ok();
  } catch (err) {
    return fail((err as Error).message);
  }
}
