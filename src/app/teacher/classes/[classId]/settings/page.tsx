import { notFound, redirect } from "next/navigation";

import { verifySession } from "@/lib/dal";
import { resolveClassSettingsViewer } from "@/lib/settings/classViewerRole";

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

  const { viewerRole } = await resolveClassSettingsViewer(
    supabase,
    user.id,
    classData.id
  );

  const mayConfigureClass =
    viewerRole === "class_owner" ||
    viewerRole === "class_teacher_co_owner" ||
    viewerRole === "class_teacher_admin" ||
    viewerRole === "institution_admin" ||
    viewerRole === "super_admin";

  if (!mayConfigureClass) {
    redirect(`/teacher/classes/${classId}`);
  }

  return (
    <ClassSettingsClient
      classData={classData}
      classId={classId}
      viewerRole={viewerRole}
    />
  );
}
