"use client";

import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import PageTitle from "@/components/Shared/PageTitle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useClassData, useClassGroups } from "@/hooks/swr";
import { createQuiz } from "@/lib/queries/quizzes";
import { createContentItem } from "@/lib/queries/contentItems";
import QuizForm from "@/components/Teacher/Quizzes/QuizForm";


export default function CreateQuizPage() {
  const params = useParams();
  const router = useTrackedRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const classId = params.classId as string;
  const classQuery = useClassData(classId);
  const classDbId = classQuery.data?.id ?? null;
  const groupsQuery = useClassGroups(classDbId);
  const classGroupId = searchParams.get("groupId") ?? groupsQuery.data?.[0]?.id ?? null;
  const loadingClass = classQuery.isLoading || groupsQuery.isLoading;
  const error = classQuery.error || groupsQuery.error ? "Failed to load class/groups" : null;

  const backToContentHref = useMemo(() => {
    const groupId = searchParams.get("groupId");
    return groupId
      ? `/teacher/classes/${classId}?tab=content&groupId=${groupId}`
      : `/teacher/classes/${classId}?tab=content`;
  }, [classId, searchParams]);

  if (loadingClass) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-muted-foreground">Loading…</p>
        </div>
      </PageLayout>
    );
  }

  if (error || !classDbId || !classGroupId) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-destructive">
            {error || "Class/groups not found"}
          </p>
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
        <PageTitle title="Create Quiz" className="mb-2" />
        <p className="text-muted-foreground mb-8">
          Multiple-choice questions (MCQ).
        </p>

        <QuizForm
          classId={classDbId}
          onSubmit={async ({
            title,
            instructions,
            questions,
            isDraft,
            randomizeQuestions,
            randomizeOptions,
            showPointsToStudents,
          }) => {
            if (!user) throw new Error("You must be logged in");

            const quiz = await createQuiz(
              {
                class_id: classDbId,
                class_group_id: classGroupId,
                title,
                instructions: instructions || null,
                questions,
                randomize_questions: randomizeQuestions,
                randomize_options: randomizeOptions,
                show_points_to_students: showPointsToStudents,
                status: isDraft ? "draft" : "active",
              },
              user.id
            );

            await createContentItem(
              {
                class_id: classDbId,
                class_group_id: classGroupId,
                type: "quiz",
                ref_id: quiz.id,
                status: isDraft ? "draft" : "active",
              },
              user.id
            );

            router.push(`/teacher/classes/${classId}/quizzes/${quiz.quiz_id}`);
          }}
        />
        <div className="mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(backToContentHref)}
          >
            Cancel
          </Button>
        </div>
      </div>
    </PageLayout>
  );
}
