import { verifySession } from "@/lib/dal";
import { notFound, redirect } from "next/navigation";
import ClassSettingsClient from "./ClassSettingsClient";

const CLASS_COLUMNS =
  "id, name, class_id, created_by, created_at, updated_at, status, preferred_language, group_count, enable_progressive_unlock, student_assignment_strategy";

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

  // Only the class owner can access settings
  if (user.id !== classData.created_by) {
    redirect(`/teacher/classes/${classId}`);
  }

  return <ClassSettingsClient classData={classData} classId={classId} />;
}
