import { verifySession } from "@/lib/dal";
import { notFound } from "next/navigation";
import ClassDetailClient from "./ClassDetailClient";

const CLASS_COLUMNS =
  "id, name, class_id, created_by, created_at, updated_at, status, preferred_language, group_count, enable_progressive_unlock, student_assignment_strategy";

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const { user, supabase } = await verifySession("/student/login");

  const { data: classData } = await supabase
    .from("classes")
    .select(CLASS_COLUMNS)
    .eq("class_id", classId)
    .eq("status", "active")
    .single();

  if (!classData) notFound();

  return (
    <ClassDetailClient
      classData={classData}
      userId={user.id}
      classId={classId}
    />
  );
}
