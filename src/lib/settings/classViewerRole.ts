import type { SupabaseClient } from "@supabase/supabase-js";

import type { ViewerRole } from "./capabilities";

export interface ClassSettingsViewerContext {
  viewerRole: ViewerRole;
  institutionId: string;
}

/**
 * Resolves platform / institution / class-teacher role for settings and
 * class-admin UI. Class authorization is driven by `class_teachers.role`.
 */
export async function resolveClassSettingsViewer(
  supabase: SupabaseClient,
  userId: string,
  classDbId: string
): Promise<ClassSettingsViewerContext> {
  const { data: classRow, error: classErr } = await supabase
    .from("classes")
    .select("id, institution_id")
    .eq("id", classDbId)
    .maybeSingle();
  if (classErr) throw classErr;
  if (!classRow) {
    throw new Error("Class not found");
  }
  const institutionId = (classRow.institution_id as string | null) ?? "";

  const [superRes, memberRes] = await Promise.all([
    supabase
      .from("platform_super_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle(),
    institutionId
      ? supabase
          .from("institution_members")
          .select("user_id")
          .eq("institution_id", institutionId)
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (!superRes.error && superRes.data) {
    return { viewerRole: "super_admin", institutionId };
  }
  if (!memberRes.error && memberRes.data) {
    return { viewerRole: "institution_admin", institutionId };
  }

  const { data: teacherRow, error: teacherErr } = await supabase
    .from("class_teachers")
    .select("role")
    .eq("class_id", classDbId)
    .eq("teacher_id", userId)
    .maybeSingle();

  if (teacherErr) throw teacherErr;

  const role = teacherRow?.role as string | undefined;
  if (role === "owner") {
    return { viewerRole: "class_owner", institutionId };
  }
  if (role === "co-owner") {
    return { viewerRole: "class_teacher_co_owner", institutionId };
  }
  if (role === "admin") {
    return { viewerRole: "class_teacher_admin", institutionId };
  }
  if (role === "co-teacher") {
    return { viewerRole: "class_co_teacher", institutionId };
  }

  return { viewerRole: "viewer", institutionId };
}
