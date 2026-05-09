import { redirect } from "next/navigation";

export default async function SurveyResponsesAliasPage({
  params,
}: {
  params: Promise<{ classId: string; surveyId: string }>;
}) {
  const { classId, surveyId } = await params;
  redirect(`/teacher/classes/${classId}/surveys/${surveyId}?tab=responses`);
}
