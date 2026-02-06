"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import PageTitle from "@/components/Shared/PageTitle";
import { useAuth } from "@/contexts/AuthContext";
import { getQuizByShortIdForTeacher, updateQuiz } from "@/lib/queries/quizzes";
import { updateContentItemStatusByRef } from "@/lib/queries/contentItems";
import QuizForm from "@/components/Teacher/Quizzes/QuizForm";
import { Quiz } from "@/types/quiz";

export default function EditQuizPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const classId = params.classId as string;
  const quizId = params.quizId as string;

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getQuizByShortIdForTeacher(quizId);
        if (!data) {
          setError("Quiz not found");
        } else {
          setQuiz(data);
        }
      } catch (err) {
        console.error("Error fetching quiz:", err);
        setError("Failed to load quiz");
      } finally {
        setLoading(false);
      }
    };

    if (quizId) fetch();
  }, [quizId]);

  if (loading) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-muted-foreground">Loading…</p>
        </div>
      </PageLayout>
    );
  }

  if (error || !quiz) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-destructive">{error || "Quiz not found"}</p>
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
        <PageTitle title="Edit Quiz" className="mb-2" />
        <p className="text-muted-foreground mb-8">
          Update questions, answers, and draft status.
        </p>

        <QuizForm
          submitLabel="Save changes"
          initialTitle={quiz.title}
          initialInstructions={quiz.instructions ?? ""}
          initialQuestions={quiz.questions}
          initialIsDraft={quiz.status === "draft"}
          initialRandomizeQuestions={quiz.randomize_questions ?? false}
          initialRandomizeOptions={quiz.randomize_options ?? false}
          initialShowPointsToStudents={quiz.show_points_to_students ?? true}
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

            const updated = await updateQuiz(quiz.id, {
              title,
              instructions: instructions || null,
              questions,
              randomize_questions: randomizeQuestions,
              randomize_options: randomizeOptions,
              show_points_to_students: showPointsToStudents,
              status: isDraft ? "draft" : "active",
            });

            await updateContentItemStatusByRef({
              class_id: quiz.class_id,
              type: "quiz",
              ref_id: quiz.id,
              status: updated.status,
            });

            router.push(`/teacher/classes/${classId}/quizzes/${quizId}`);
          }}
        />
      </div>
    </PageLayout>
  );
}
