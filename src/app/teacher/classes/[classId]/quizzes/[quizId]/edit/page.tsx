"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
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
        <div className="p-8 text-center">
          <p className="text-muted-foreground">Loading…</p>
        </div>
      </PageLayout>
    );
  }

  if (error || !quiz) {
    return (
      <PageLayout>
        <div className="p-8 text-center">
          <p className="text-destructive">{error || "Quiz not found"}</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto p-8">
        <div className="mb-4">
          <BackButton />
        </div>
        <h1 className="text-3xl font-bold mb-2">Edit Quiz</h1>
        <p className="text-muted-foreground mb-8">
          Update questions, answers, and draft status.
        </p>

        <QuizForm
          submitLabel="Save changes"
          initialTitle={quiz.title}
          initialQuestions={quiz.questions}
          initialIsDraft={quiz.status === "draft"}
          onSubmit={async ({ title, questions, isDraft }) => {
            if (!user) throw new Error("You must be logged in");

            const updated = await updateQuiz(quiz.id, {
              title,
              questions,
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
