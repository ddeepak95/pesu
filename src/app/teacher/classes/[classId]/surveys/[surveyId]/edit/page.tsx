"use client";

import { useParams } from "next/navigation";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import PageTitle from "@/components/Shared/PageTitle";
import { useAuth } from "@/contexts/AuthContext";
import { updateSurvey } from "@/lib/queries/surveys";
import { updateContentItemStatusByRef } from "@/lib/queries/contentItems";
import SurveyForm from "@/components/Teacher/Surveys/SurveyForm";
import { showSuccessToast } from "@/lib/toast";
import { useSurveyByShortIdForTeacher } from "@/hooks/swr";

export default function EditSurveyPage() {
  const params = useParams();
  const router = useTrackedRouter();
  const { user } = useAuth();

  const surveyId = params.surveyId as string;

  const surveyQuery = useSurveyByShortIdForTeacher(surveyId);
  const survey = surveyQuery.data ?? null;
  const loading = surveyQuery.isLoading;
  const error = surveyQuery.error
    ? "Failed to load survey"
    : !loading && !survey
      ? "Survey not found"
      : null;

  if (loading) {
    return (
      <PageLayout>
        <div />
      </PageLayout>
    );
  }

  if (error || !survey) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-destructive">{error || "Survey not found"}</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div>
        <div className="mb-4">
          <BackButton />
        </div>
        <PageTitle title="Edit Survey" className="mb-2" />
        <p className="text-muted-foreground mb-8">
          Update questions and draft status.
        </p>

        <SurveyForm
          submitLabel="Save changes"
          initialTitle={survey.title}
          initialDescription={survey.description || ""}
          initialQuestions={survey.questions}
          initialIsDraft={survey.status === "draft"}
          onSubmit={async ({ title, description, questions, isDraft }) => {
            if (!user) throw new Error("You must be logged in");

            const updated = await updateSurvey(survey.id, {
              title,
              description,
              questions,
              status: isDraft ? "draft" : "active",
            });

            await updateContentItemStatusByRef({
              class_id: survey.class_id,
              type: "survey",
              ref_id: survey.id,
              status: updated.status,
            });

            showSuccessToast("Survey updated successfully");
          }}
        />

        <div className="mt-6 flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Close
          </Button>
        </div>
      </div>
    </PageLayout>
  );
}
