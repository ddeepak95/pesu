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
  const slugRaw = formString(formData, "slug");

  let errorMessage: string | null = null;
  try {
    await createInstitution(supabase, { name, slug: slugRaw || null });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }
  if (errorMessage) {
    redirect(buildNoticeUrl("/platform", { error: errorMessage }));
  }

  revalidatePath("/platform");
  redirect(buildNoticeUrl("/platform", { ok: "Institution created" }));
}

export async function addInstitutionAdminAction(
  formData: FormData
): Promise<void> {
  const { supabase } = await requireSuperAdmin();

  const institutionId = formString(formData, "institutionId");
  const email = formString(formData, "email");
  const detailPath = institutionId
    ? `/platform/institutions/${institutionId}`
    : "/platform";

  if (!institutionId) {
    redirect(buildNoticeUrl("/platform", { error: "Missing institution id" }));
  }
  if (!email) {
    redirect(buildNoticeUrl(detailPath, { error: "Email is required" }));
  }

  let errorMessage: string | null = null;
  try {
    await addInstitutionAdminByEmail(supabase, institutionId, email);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }
  if (errorMessage) {
    redirect(buildNoticeUrl(detailPath, { error: errorMessage }));
  }

  revalidatePath(detailPath);
  redirect(buildNoticeUrl(detailPath, { ok: `Added ${email} as admin` }));
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

export async function moveClassAction(formData: FormData): Promise<void> {
  const { supabase } = await requireSuperAdmin();

  const classDbId = formString(formData, "classDbId");
  const targetInstitutionId = formString(formData, "targetInstitutionId");
  const reasonRaw = formString(formData, "reason");

  if (!classDbId) {
    redirect(buildNoticeUrl("/platform", { error: "Class id is required" }));
  }
  if (!targetInstitutionId) {
    redirect(
      buildNoticeUrl("/platform", {
        error: "Target institution id is required",
      })
    );
  }

  let errorMessage: string | null = null;
  let auditId: string | null = null;
  try {
    const { data, error } = await supabase.rpc("move_class_to_institution", {
      p_class_id: classDbId,
      p_target_institution_id: targetInstitutionId,
      p_reason: reasonRaw || null,
    });
    if (error) throw error;
    auditId = (data as string | null) ?? null;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }
  if (errorMessage) {
    redirect(buildNoticeUrl("/platform", { error: errorMessage }));
  }

  revalidatePath("/platform");
  revalidatePath(`/platform/institutions/${targetInstitutionId}`);
  redirect(
    buildNoticeUrl("/platform", {
      ok: auditId ? "Class moved" : "Class already in target institution",
    })
  );
}
