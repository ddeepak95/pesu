import { verifySession, getContentUnlockState, buildContentItemUrl } from "@/lib/dal";
import { notFound } from "next/navigation";
import SurveyDetailClient from "./SurveyDetailClient";
import { ContentLockedView } from "@/components/Shared/ContentLockedView";

const SURVEY_ALL_COLUMNS =
  "id, survey_id, class_id, class_group_id, title, description, questions, created_by, created_at, updated_at, status";

const SURVEY_RESPONSE_ALL_COLUMNS =
  "id, survey_id, student_id, answers, submitted_at";

export default async function StudentSurveyPage({
  params,
}: {
  params: Promise<{ classId: string; surveyId: string }>;
}) {
  const { classId, surveyId } = await params;
  const { user, supabase } = await verifySession("/student/login");

  const { data: surveyData } = await supabase
    .from("surveys")
    .select(SURVEY_ALL_COLUMNS)
    .eq("survey_id", surveyId)
    .in("status", ["active", "draft"])
    .single();

  if (!surveyData) notFound();

  // Check unlock state
  const unlockResult = await getContentUnlockState(
    supabase,
    user.id,
    classId,
    surveyData.id,
    "survey"
  );

  if (unlockResult.isLocked) {
    let backHref = `/student/classes/${classId}`;
    let backLabel = "Go to class";
    const prev = unlockResult.previousItem;
    if (prev) {
      const url = await buildContentItemUrl(
        supabase,
        classId,
        prev.refId,
        prev.type
      );
      if (url) {
        backHref = url;
        backLabel = "Go to previous item";
      }
    }
    return (
      <ContentLockedView
        lockReason={unlockResult.lockReason!}
        classHref={`/student/classes/${classId}`}
        backHref={backHref}
        backLabel={backLabel}
      />
    );
  }

  // Check for existing response
  const { data: existingResponse } = await supabase
    .from("survey_responses")
    .select(SURVEY_RESPONSE_ALL_COLUMNS)
    .eq("survey_id", surveyData.id)
    .eq("student_id", user.id)
    .maybeSingle();

  return (
    <SurveyDetailClient
      survey={surveyData}
      contentItemId={unlockResult.contentItemId}
      existingResponse={existingResponse}
      classUuid={unlockResult.classUuid}
      classId={classId}
    />
  );
}
