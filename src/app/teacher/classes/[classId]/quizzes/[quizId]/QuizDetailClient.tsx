"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { updateQuiz, deleteQuiz } from "@/lib/queries/quizzes";
import {
  softDeleteContentItemByRef,
  updateContentItemStatusByRef,
} from "@/lib/queries/contentItems";
import { Quiz } from "@/types/quiz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import QuizSubmissionsTab from "@/components/Teacher/Quizzes/QuizSubmissionsTab";
import MarkdownContent from "@/components/Shared/MarkdownContent";

interface QuizDetailClientProps {
  initialQuiz: Quiz;
  classId: string;
}

export default function QuizDetailClient({
  initialQuiz,
  classId,
}: QuizDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const quizId = initialQuiz.quiz_id;
  const [quiz, setQuiz] = useState<Quiz>(initialQuiz);

  const handleEdit = () => {
    const qs = searchParams.toString();
    router.push(
      `/teacher/classes/${classId}/quizzes/${quizId}/edit${qs ? `?${qs}` : ""}`,
    );
  };

  const handleDelete = async () => {
    if (!user || !quiz) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this quiz? This action cannot be undone.",
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

  const handlePublish = async () => {
    if (!quiz) return;

    try {
      const updated = await updateQuiz(quiz.id, {
        title: quiz.title,
        instructions: quiz.instructions,
        questions: quiz.questions,
        randomize_questions: quiz.randomize_questions,
        randomize_options: quiz.randomize_options,
        show_points_to_students: quiz.show_points_to_students,
        status: "active",
      });

      await updateContentItemStatusByRef({
        class_id: quiz.class_id,
        type: "quiz",
        ref_id: quiz.id,
        status: updated.status,
      });

      setQuiz(updated);
    } catch (err) {
      console.error("Error publishing quiz:", err);
      alert("Failed to publish quiz. Please try again.");
    }
  };

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
                <span>&bull;</span>
                <p className="capitalize">Status: {quiz.status}</p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Options</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {quiz.status === "draft" && (
                  <DropdownMenuItem onClick={handlePublish}>
                    Publish
                  </DropdownMenuItem>
                )}
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

          {/* Student Instructions */}
          {quiz.instructions && (
            <div className="mb-6">
              <MarkdownContent content={quiz.instructions} />
            </div>
          )}

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
                    (o) => o.id === q.correct_option_id,
                  );
                  return (
                    <Card key={idx}>
                      <CardHeader>
                        <CardTitle className="text-lg">
                          Question {idx + 1} &bull; {q.points} pts
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
              <QuizSubmissionsTab quiz={quiz} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PageLayout>
  );
}
