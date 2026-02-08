import { verifySession, getContentUnlockState } from "@/lib/dal";
import { notFound } from "next/navigation";
import SurveyDetailClient from "./SurveyDetailClient";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";

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
    return (
      <PageLayout>
        <div>
          <div className="mb-4">
            <BackButton />
          </div>
          <div className="text-center py-12">
            <div className="inline-block p-4 rounded-full bg-muted mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-12 w-12 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2">Content Locked</h2>
            <p className="text-muted-foreground mb-4">
              {unlockResult.lockReason}
            </p>
            <BackButton />
          </div>
        </div>
      </PageLayout>
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
