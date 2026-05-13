import { notFound, redirect } from "next/navigation";

import { verifySession } from "@/lib/dal";
import type { ViewerRole } from "@/lib/settings/capabilities";

import ClassSettingsClient from "./ClassSettingsClient";

const CLASS_COLUMNS =
  "id, name, class_id, created_by, created_at, updated_at, status, preferred_language, group_count, enable_progressive_unlock, student_assignment_strategy, institution_id";

export default async function ClassSettingsPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const { user, supabase } = await verifySession("/teacher/login");

  const { data: classData } = await supabase
    .from("classes")
    .select(CLASS_COLUMNS)
    .eq("class_id", classId)
    .eq("status", "active")
    .single();

  if (!classData) notFound();

  const isOwner = user.id === classData.created_by;

  // Institution-admin / super-admin viewers also gain access (so they can
  // manage inherited-setting overrides). Owner-only sections stay gated by
  // `isOwner` inside the client component.
  let viewerRole: ViewerRole = isOwner ? "class_owner" : "viewer";
  const institutionId = (classData.institution_id as string | null) ?? null;

  if (!isOwner) {
    const [superRes, memberRes] = await Promise.all([
      supabase
        .from("platform_super_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle(),
      institutionId
        ? supabase
            .from("institution_members")
            .select("user_id")
            .eq("institution_id", institutionId)
            .eq("user_id", user.id)
            .eq("role", "admin")
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (!superRes.error && superRes.data) {
      viewerRole = "super_admin";
    } else if (!memberRes.error && memberRes.data) {
      viewerRole = "institution_admin";
    }
  }

  if (viewerRole === "viewer") {
    redirect(`/teacher/classes/${classId}`);
  }

  return (
    <ClassSettingsClient
      classData={classData}
      classId={classId}
      isOwner={isOwner}
      viewerRole={viewerRole}
    />
  );
}
