"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import { getQuizByShortId } from "@/lib/queries/quizzes";
import { Quiz } from "@/types/quiz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActivityTracking } from "@/hooks/useActivityTracking";
import { useAuth } from "@/contexts/AuthContext";
import { ActivityTrackingProvider } from "@/contexts/ActivityTrackingContext";

function QuizPageContent() {
  const params = useParams();
  const classId = params.classId as string;
  const quizId = params.quizId as string;

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Activity tracking for quiz viewing time
  // Uses ActivityTrackingContext for userId and classId
  useActivityTracking({
    componentType: "quiz",
    componentId: quizId,
    enabled: !loading && !!quiz, // Only track when quiz is loaded
  });

  const fetchQuiz = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getQuizByShortId(quizId);
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

  useEffect(() => {
    if (quizId) fetchQuiz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  if (loading) {
    return (
      <PageLayout>
        <div className="p-8 text-center">
          <p className="text-muted-foreground">Loading quiz...</p>
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
      <div className="border-b">
        <div className="p-8 pb-0">
          <div className="mb-4">
            <BackButton href={`/students/classes/${classId}`} />
          </div>
          <div className="mb-6">
            <h1 className="text-3xl font-bold">{quiz.title}</h1>
            <div className="flex items-center gap-4 mt-1 text-muted-foreground">
              <p>{quiz.total_points} points total</p>
            </div>
          </div>

          <div className="space-y-4 pb-8">
            {quiz.questions
              .sort((a, b) => a.order - b.order)
              .map((q, idx) => (
                <Card key={idx}>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Question {idx + 1} • {q.points} pts
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="whitespace-pre-wrap">{q.prompt}</p>
                    <div className="space-y-2">
                      {q.options.map((o) => (
                        <div
                          key={o.id}
                          className="flex items-center rounded-md border px-3 py-2"
                        >
                          <span>{o.text}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default function StudentQuizPage() {
  const params = useParams();
  const classId = params.classId as string;
  const { user } = useAuth();

  return (
    <ActivityTrackingProvider userId={user?.id} classId={classId}>
      <QuizPageContent />
    </ActivityTrackingProvider>
  );
}
