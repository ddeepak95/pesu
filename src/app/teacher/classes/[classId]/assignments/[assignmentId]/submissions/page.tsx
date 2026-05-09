import { redirect } from "next/navigation";

export default async function AssignmentSubmissionsAliasPage({
  params,
}: {
  params: Promise<{ classId: string; assignmentId: string }>;
}) {
  const { classId, assignmentId } = await params;
  redirect(
    `/teacher/classes/${classId}/assignments/${assignmentId}?tab=submissions`
  );
}
