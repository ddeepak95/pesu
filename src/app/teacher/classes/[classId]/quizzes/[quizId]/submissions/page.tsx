import { redirect } from "next/navigation";

export default async function QuizSubmissionsAliasPage({
  params,
}: {
  params: Promise<{ classId: string; quizId: string }>;
}) {
  const { classId, quizId } = await params;
  redirect(`/teacher/classes/${classId}/quizzes/${quizId}?tab=submissions`);
}
