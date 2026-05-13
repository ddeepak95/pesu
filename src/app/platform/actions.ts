"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/dal";
import {
  createInstitution,
  addInstitutionAdminByEmail,
  removeInstitutionAdmin,
} from "@/lib/queries/institutions";

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function buildNoticeUrl(
  basePath: string,
  status: { ok: string } | { error: string }
): string {
  const params = new URLSearchParams();
  if ("ok" in status) {
    params.set("ok", status.ok);
  } else {
    params.set("error", status.error);
  }
  return `${basePath}?${params.toString()}`;
}

export async function createInstitutionAction(
  formData: FormData
): Promise<void> {
  const { supabase } = await requireSuperAdmin();

  const name = formString(formData, "name");
  if (!name) {
    redirect(buildNoticeUrl("/platform", { error: "Name is required" }));
  }

  let errorMessage: string | null = null;
  try {
    await createInstitution(supabase, { name });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }
  if (errorMessage) {
    redirect(buildNoticeUrl("/platform", { error: errorMessage }));
  }

  revalidatePath("/platform");
  redirect(buildNoticeUrl("/platform", { ok: "Institution created" }));
}

export interface AddAdminResult {
  ok: boolean;
  error?: string;
}

/**
 * Add an institution admin by email and return a Result so callers (dialog
 * UIs) can surface errors without a redirect-and-banner round-trip. Useful
 * when the email doesn't resolve to an existing auth user.
 */
export async function addInstitutionAdminRequestAction(input: {
  institutionId: string;
  email: string;
}): Promise<AddAdminResult> {
  const { supabase } = await requireSuperAdmin();

  const institutionId = input.institutionId?.trim() ?? "";
  const email = input.email?.trim() ?? "";
  if (!institutionId)
    return { ok: false, error: "Missing institution id" };
  if (!email) return { ok: false, error: "Email is required" };

  try {
    await addInstitutionAdminByEmail(supabase, institutionId, email);
    revalidatePath(`/platform/institutions/${institutionId}`);
    revalidatePath(`/admin/institutions/${institutionId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function removeInstitutionAdminAction(
  formData: FormData
): Promise<void> {
  const { supabase } = await requireSuperAdmin();

  const institutionId = formString(formData, "institutionId");
  const userId = formString(formData, "userId");
  const detailPath = institutionId
    ? `/platform/institutions/${institutionId}`
    : "/platform";

  if (!institutionId || !userId) {
    redirect(
      buildNoticeUrl(detailPath, {
        error: "Missing institution or user id",
      })
    );
  }

  let errorMessage: string | null = null;
  try {
    await removeInstitutionAdmin(supabase, institutionId, userId);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }
  if (errorMessage) {
    redirect(buildNoticeUrl(detailPath, { error: errorMessage }));
  }

  revalidatePath(detailPath);
  redirect(buildNoticeUrl(detailPath, { ok: "Admin removed" }));
}

export interface MoveClassResult {
  ok: boolean;
  error?: string;
  /**
   * UUID of the `class_institution_moves` audit row. `null` when the class
   * was already in the target institution (RPC short-circuits).
   */
  auditId?: string | null;
}

/**
 * Move a class to another institution via the audited RPC.
 *
 * Returns a Result object so callers (e.g. dialog UIs) can show inline errors
 * and stay on the current page instead of being redirected. The platform and
 * target-institution pages are revalidated server-side; the caller is expected
 * to `router.refresh()` to repaint the source institution view.
 */
export async function moveClassRequestAction(input: {
  classDbId: string;
  targetInstitutionId: string;
  reason?: string | null;
}): Promise<MoveClassResult> {
  const { supabase } = await requireSuperAdmin();

  const classDbId = input.classDbId?.trim() ?? "";
  const targetInstitutionId = input.targetInstitutionId?.trim() ?? "";
  if (!classDbId) return { ok: false, error: "Class id is required" };
  if (!targetInstitutionId)
    return { ok: false, error: "Target institution is required" };

  try {
    const { data, error } = await supabase.rpc("move_class_to_institution", {
      p_class_id: classDbId,
      p_target_institution_id: targetInstitutionId,
      p_reason: input.reason?.trim() || null,
    });
    if (error) throw error;
    revalidatePath("/platform");
    revalidatePath(`/platform/institutions/${targetInstitutionId}`);
    return { ok: true, auditId: (data as string | null) ?? null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
