import { verifySession } from "@/lib/dal";
import { notFound } from "next/navigation";
import StudentSettingsClient from "./StudentSettingsClient";

const CLASS_COLUMNS =
  "id, name, class_id, created_by, created_at, updated_at, status, preferred_language, group_count, enable_progressive_unlock, student_assignment_strategy";

export default async function StudentSettingsPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const { supabase } = await verifySession("/student/login");

  const { data: classData } = await supabase
    .from("classes")
    .select(CLASS_COLUMNS)
    .eq("class_id", classId)
    .eq("status", "active")
    .single();

  if (!classData) notFound();

  return <StudentSettingsClient classData={classData} />;
}
