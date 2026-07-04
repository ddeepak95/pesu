import { cache } from "react";
import { verifySession } from "@/lib/dal";
import { notFound } from "next/navigation";
import SurveyDetailClient from "./SurveyDetailClient";

const SURVEY_ALL_COLUMNS =
  "id, survey_id, class_id, class_group_id, title, description, questions, created_by, created_at, updated_at, status";

const getSurveyData = cache(async (surveyId: string) => {
  const { supabase } = await verifySession("/teacher/login");

  const { data } = await supabase
    .from("surveys")
    .select(SURVEY_ALL_COLUMNS)
    .eq("survey_id", surveyId)
    .in("status", ["active", "draft"])
    .single();

  return data;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const { surveyId } = await params;
  const surveyData = await getSurveyData(surveyId);
  return { title: surveyData?.title ?? "Survey" };
}

export default async function SurveyDetailPage({
  params,
}: {
  params: Promise<{ classId: string; surveyId: string }>;
}) {
  const { classId, surveyId } = await params;
  const { supabase } = await verifySession("/teacher/login");
  const surveyData = await getSurveyData(surveyId);

  if (!surveyData) notFound();

  // Fetch response count
  const { count } = await supabase
    .from("survey_responses")
    .select("id", { count: "exact", head: true })
    .eq("survey_id", surveyData.id);

  return (
    <SurveyDetailClient
      initialSurvey={surveyData}
      initialResponseCount={count ?? 0}
      classId={classId}
    />
  );
}
