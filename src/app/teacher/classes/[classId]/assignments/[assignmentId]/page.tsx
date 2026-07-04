import { cache } from "react";
import { verifySession } from "@/lib/dal";
import { notFound } from "next/navigation";
import AssignmentDetailClient from "./AssignmentDetailClient";

const ASSIGNMENT_ALL_COLUMNS = "*";

const getAssignmentData = cache(async (assignmentId: string) => {
  const { supabase } = await verifySession("/teacher/login");

  const { data } = await supabase
    .from("assignments")
    .select(ASSIGNMENT_ALL_COLUMNS)
    .eq("assignment_id", assignmentId)
    .in("status", ["active", "draft"])
    .single();

  return data;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  const assignmentData = await getAssignmentData(assignmentId);
  return { title: assignmentData?.title ?? "Assignment" };
}

export default async function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ classId: string; assignmentId: string }>;
}) {
  const { classId, assignmentId } = await params;
  const assignmentData = await getAssignmentData(assignmentId);

  if (!assignmentData) notFound();

  return (
    <AssignmentDetailClient
      initialAssignment={assignmentData}
      classId={classId}
    />
  );
}
