"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/dal";
import {
  createInstitution,
  addInstitutionAdminByEmail,
  removeInstitutionAdmin,
  getInstitution,
  countClassesByInstitution,
  archiveInstitution,
  restoreInstitution,
  deleteInstitution,
  updateInstitutionPreferredLanguage,
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

/**
 * Delete an institution if it has no classes (of any status) under it;
 * otherwise archive it instead, since a hard delete would fail on the
 * `classes.institution_id` FK anyway. The default institution can never be
 * deleted or archived.
 */
export async function deleteOrArchiveInstitutionAction(
  formData: FormData
): Promise<void> {
  const { supabase } = await requireSuperAdmin();

  const institutionId = formString(formData, "institutionId");
  const detailPath = institutionId
    ? `/platform/institutions/${institutionId}`
    : "/platform";

  if (!institutionId) {
    redirect(buildNoticeUrl("/platform", { error: "Missing institution id" }));
  }

  let errorMessage: string | null = null;
  let deleted = false;
  try {
    const institution = await getInstitution(supabase, institutionId);
    if (!institution) {
      throw new Error("Institution not found");
    }
    if (institution.is_default) {
      throw new Error("The default institution can't be deleted or archived");
    }

    const classCount = await countClassesByInstitution(supabase, institutionId);
    if (classCount === 0) {
      await deleteInstitution(supabase, institutionId);
      deleted = true;
    } else {
      await archiveInstitution(supabase, institutionId);
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  if (errorMessage) {
    redirect(buildNoticeUrl(detailPath, { error: errorMessage }));
  }

  revalidatePath("/platform");
  if (deleted) {
    redirect(buildNoticeUrl("/platform", { ok: "Institution deleted" }));
  }
  revalidatePath(detailPath);
  redirect(
    buildNoticeUrl(detailPath, {
      ok: "Institution archived (it still has classes)",
    })
  );
}

export async function restoreInstitutionAction(
  formData: FormData
): Promise<void> {
  const { supabase } = await requireSuperAdmin();

  const institutionId = formString(formData, "institutionId");
  const detailPath = institutionId
    ? `/platform/institutions/${institutionId}`
    : "/platform";

  if (!institutionId) {
    redirect(buildNoticeUrl("/platform", { error: "Missing institution id" }));
  }

  let errorMessage: string | null = null;
  try {
    await restoreInstitution(supabase, institutionId);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }
  if (errorMessage) {
    redirect(buildNoticeUrl(detailPath, { error: errorMessage }));
  }

  revalidatePath("/platform");
  revalidatePath(detailPath);
  redirect(buildNoticeUrl(detailPath, { ok: "Institution restored" }));
}

export interface UpdatePreferredLanguageResult {
  ok: boolean;
  error?: string;
}

/**
 * Update an institution's default preferred language, used to seed
 * `preferredLanguage` when an admin creates a class under this institution.
 * Super-admin-only, matching the existing "Super admins manage institutions"
 * RLS policy (institution admins can read but not write this row).
 */
export async function updateInstitutionPreferredLanguageAction(input: {
  institutionId: string;
  preferredLanguage: string;
}): Promise<UpdatePreferredLanguageResult> {
  const { supabase } = await requireSuperAdmin();

  const institutionId = input.institutionId?.trim() ?? "";
  const preferredLanguage = input.preferredLanguage?.trim() ?? "";
  if (!institutionId) return { ok: false, error: "Missing institution id" };
  if (!preferredLanguage)
    return { ok: false, error: "Preferred language is required" };

  try {
    await updateInstitutionPreferredLanguage(
      supabase,
      institutionId,
      preferredLanguage
    );
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
