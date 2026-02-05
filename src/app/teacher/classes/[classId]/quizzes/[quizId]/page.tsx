"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import PageTitle from "@/components/Shared/PageTitle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { getQuizByShortIdForTeacher, deleteQuiz } from "@/lib/queries/quizzes";
import { softDeleteContentItemByRef } from "@/lib/queries/contentItems";
import { Quiz } from "@/types/quiz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function QuizDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const classId = params.classId as string;
  const quizId = params.quizId as string;

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQuiz = async () => {
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

  useEffect(() => {
    if (quizId) fetchQuiz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const handleEdit = () => {
    const qs = searchParams.toString();
    router.push(
      `/teacher/classes/${classId}/quizzes/${quizId}/edit${qs ? `?${qs}` : ""}`
    );
  };

  const handleDelete = async () => {
    if (!user || !quiz) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this quiz? This action cannot be undone."
    );
    if (!confirmed) return;

    try {
      await deleteQuiz(quiz.id);
      await softDeleteContentItemByRef({
        class_id: quiz.class_id,
        type: "quiz",
        ref_id: quiz.id,
      });
      router.push(`/teacher/classes/${classId}`);
    } catch (err) {
      console.error("Error deleting quiz:", err);
      alert("Failed to delete quiz. Please try again.");
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-muted-foreground">Loading quiz...</p>
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
        <div>
          <div className="mb-4">
            <BackButton />
          </div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <PageTitle title={quiz.title} />
              <div className="flex items-center gap-4 mt-1 text-muted-foreground">
                <p>{quiz.total_points} points total</p>
                <span>•</span>
                <p className="capitalize">Status: {quiz.status}</p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Options</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleEdit}>Edit</DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive"
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Tabs defaultValue="questions" className="w-full">
            <TabsList>
              <TabsTrigger value="questions">Questions</TabsTrigger>
              <TabsTrigger value="submissions">Submissions</TabsTrigger>
            </TabsList>

            <TabsContent value="questions" className="space-y-4 py-6">
              {quiz.questions
                .sort((a, b) => a.order - b.order)
                .map((q, idx) => {
                  const correct = q.options.find(
                    (o) => o.id === q.correct_option_id
                  );
                  return (
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
                              className="flex items-center justify-between rounded-md border px-3 py-2"
                            >
                              <span>{o.text}</span>
                              {o.id === q.correct_option_id && (
                                <span className="text-xs text-muted-foreground">
                                  Correct
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                        {correct && (
                          <p className="text-sm text-muted-foreground">
                            Correct answer: {correct.text}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
            </TabsContent>

            <TabsContent value="submissions" className="py-6">
              <div className="text-center p-12">
                <p className="text-muted-foreground text-lg">
                  Submissions feature coming soon
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PageLayout>
  );
}
