import { verifySession } from "@/lib/dal";
import { notFound } from "next/navigation";
import AssignmentDetailClient from "./AssignmentDetailClient";

const ASSIGNMENT_ALL_COLUMNS = "*";

export default async function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ classId: string; assignmentId: string }>;
}) {
  const { classId, assignmentId } = await params;
  const { supabase } = await verifySession("/teacher/login");

  const { data: assignmentData } = await supabase
    .from("assignments")
    .select(ASSIGNMENT_ALL_COLUMNS)
    .eq("assignment_id", assignmentId)
    .in("status", ["active", "draft"])
    .single();

  if (!assignmentData) notFound();

  return (
    <AssignmentDetailClient
      initialAssignment={assignmentData}
      classId={classId}
    />
  );
}
