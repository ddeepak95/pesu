"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import PageTitle from "@/components/Shared/PageTitle";
import { useAuth } from "@/contexts/AuthContext";
import {
  getSurveyByShortIdForTeacher,
  updateSurvey,
} from "@/lib/queries/surveys";
import { updateContentItemStatusByRef } from "@/lib/queries/contentItems";
import SurveyForm from "@/components/Teacher/Surveys/SurveyForm";
import { Survey } from "@/types/survey";

export default function EditSurveyPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const classId = params.classId as string;
  const surveyId = params.surveyId as string;

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getSurveyByShortIdForTeacher(surveyId);
        if (!data) {
          setError("Survey not found");
        } else {
          setSurvey(data);
        }
      } catch (err) {
        console.error("Error fetching survey:", err);
        setError("Failed to load survey");
      } finally {
        setLoading(false);
      }
    };

    if (surveyId) fetch();
  }, [surveyId]);

  if (loading) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-muted-foreground">Loading…</p>
        </div>
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

            router.push(`/teacher/classes/${classId}/surveys/${surveyId}`);
          }}
        />
      </div>
    </PageLayout>
  );
}
