"use client";

import { useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import {
  buildTeacherDetailHrefWithTab,
  resolveTeacherDetailTabParam,
} from "@/lib/teacherDetailTabUrl";
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
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  MutedPrimaryTabsList,
  MutedPrimaryTabsTrigger,
} from "@/components/Teacher/Shared/MutedPrimaryTabs";
import { useAuth } from "@/contexts/AuthContext";
import { updateQuiz, deleteQuiz } from "@/lib/queries/quizzes";
import { updateContentItemStatusByRef } from "@/lib/queries/contentItems";
import { countContentItemPlacementsByRefTracked } from "@/lib/swr/imperativeReads";
import { resolveTeacherPlacementGroupId } from "@/lib/contentPlacements";
import { removeTeacherMaterialPlacementOrEntity } from "@/lib/teacherMaterialRemove";
import { Quiz } from "@/types/quiz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import QuizSubmissionsTab from "@/components/Teacher/Quizzes/QuizSubmissionsTab";
import MarkdownContent from "@/components/Shared/MarkdownContent";
import { showErrorToast } from "@/lib/toast";
import { useMaterialLinkedAcrossGroups } from "@/hooks/swr";

interface QuizDetailClientProps {
  initialQuiz: Quiz;
  classId: string;
}

const QUIZ_DETAIL_TABS = ["questions", "submissions"] as const;

export default function QuizDetailClient({
  initialQuiz,
  classId,
}: QuizDetailClientProps) {
  const router = useTrackedRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const quizId = initialQuiz.quiz_id;
  const [quiz, setQuiz] = useState<Quiz>(initialQuiz);

  const placementGroupId = useMemo(
    () => resolveTeacherPlacementGroupId(searchParams.get("groupId"), quiz.class_group_id),
    [searchParams, quiz.class_group_id]
  );

  const activeQuizTab = useMemo(
    () =>
      resolveTeacherDetailTabParam(searchParams.get("tab"), {
        allowedTabs: QUIZ_DETAIL_TABS,
        defaultTab: "questions",
      }),
    [searchParams]
  );

  const setQuizTab = (value: string) => {
    router.replace(
      buildTeacherDetailHrefWithTab(pathname, searchParams, value, {
        allowedTabs: QUIZ_DETAIL_TABS,
        defaultTab: "questions",
      }),
      { scroll: false }
    );
  };

  const isLinkedAcrossGroups = useMaterialLinkedAcrossGroups(
    quiz.class_id,
    "quiz",
    quiz.id
  );

  const handleEdit = () => {
    const qs = searchParams.toString();
    router.push(
      `/teacher/classes/${classId}/quizzes/${quizId}/edit${qs ? `?${qs}` : ""}`,
    );
  };

  const handleDelete = async () => {
    if (!user || !quiz) return;

    let placementCount = 1;
    try {
      placementCount = await countContentItemPlacementsByRefTracked({
        classId: quiz.class_id,
        type: "quiz",
        refId: quiz.id,
      });
    } catch (e) {
      console.error(e);
      showErrorToast("Could not verify quiz placements. Please try again.");
      return;
    }

    const confirmed = window.confirm(
      placementCount > 1
        ? "This quiz is linked in more than one group. Remove it only from this group's feed? Other groups will keep access. To choose which feed, open the quiz from Class Content with the correct group tab (or add ?groupId=… to the URL)."
        : "Are you sure you want to delete this quiz? This action cannot be undone.",
    );
    if (!confirmed) return;

    try {
      await removeTeacherMaterialPlacementOrEntity({
        classDbId: quiz.class_id,
        type: "quiz",
        refId: quiz.id,
        placementGroupId,
        deleteEntitySoft: () => deleteQuiz(quiz.id),
      });
      router.push(`/teacher/classes/${classId}`);
    } catch (err) {
      console.error("Error deleting quiz:", err);
      const msg =
        err instanceof Error ? err.message : "Failed to delete quiz. Please try again.";
      showErrorToast(msg);
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
      showErrorToast("Failed to publish quiz. Please try again.");
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
              <PageTitle title={quiz.title} isLinked={isLinkedAcrossGroups} />
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

          <Tabs
            value={activeQuizTab}
            onValueChange={setQuizTab}
            className="w-full"
          >
            <MutedPrimaryTabsList className="mb-4 h-auto w-auto gap-1 rounded-md p-1">
              <MutedPrimaryTabsTrigger
                value="questions"
                className="rounded-sm px-4 py-2"
              >
                Questions
              </MutedPrimaryTabsTrigger>
              <MutedPrimaryTabsTrigger
                value="submissions"
                className="rounded-sm px-4 py-2"
              >
                Submissions
              </MutedPrimaryTabsTrigger>
            </MutedPrimaryTabsList>

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
              <QuizSubmissionsTab quiz={quiz} placementGroupId={placementGroupId} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PageLayout>
  );
}
