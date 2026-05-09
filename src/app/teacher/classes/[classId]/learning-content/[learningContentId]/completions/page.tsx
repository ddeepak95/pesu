import { redirect } from "next/navigation";

export default async function LearningContentCompletionsAliasPage({
  params,
}: {
  params: Promise<{ classId: string; learningContentId: string }>;
}) {
  const { classId, learningContentId } = await params;
  redirect(
    `/teacher/classes/${classId}/learning-content/${learningContentId}?tab=completions`
  );
}
