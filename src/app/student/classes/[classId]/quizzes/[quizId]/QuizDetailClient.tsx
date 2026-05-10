"use client";

import { useEffect, useMemo, useState } from "react";
import PageLayout from "@/components/PageLayout";
import CloseButton from "@/components/ui/close-button";
import GoToClassButton from "@/components/ui/go-to-class-button";
import NextItemButton from "@/components/ui/next-item-button";
import PageTitle from "@/components/Shared/PageTitle";
import { Pill } from "@/components/ui/pill";
import { useAuth } from "@/contexts/AuthContext";
import {
  ActivityTrackingProvider,
  useActivityTrackingContext,
} from "@/contexts/ActivityTrackingContext";
import { useComponentCloseTracking } from "@/hooks/useComponentCloseTracking";
import { emitActivityEvent } from "@/lib/activity/emitter";
import { useNavigationTracking } from "@/hooks/useNavigationTracking";
import { createQuizSubmission } from "@/lib/queries/quizzes";
import { markContentAsComplete } from "@/lib/queries/contentCompletions";
import { invalidateCompletionsCache } from "@/hooks/swr";
import { Quiz, QuizSubmission, QuizSubmissionAnswer } from "@/types/quiz";
import { getSessionSeed, shuffleWithSeed } from "@/utils/quizRandomization";
import { calculateQuizScore } from "@/utils/quizScoring";
import MarkdownContent from "@/components/Shared/MarkdownContent";
import QuizQuestionCard from "@/components/Student/Quizzes/QuizQuestionCard";
import QuizSubmissionBar from "@/components/Student/Quizzes/QuizSubmissionBar";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

interface QuizInnerProps {
  quiz: Quiz;
  contentItemId: string | null;
  initialIsComplete: boolean;
  existingSubmission: QuizSubmission | null;
  classId: string;
  classUuid: string | null;
}

function QuizInner({
  quiz,
  contentItemId,
  initialIsComplete,
  existingSubmission: initialSubmission,
  classId,
  classUuid,
}: QuizInnerProps) {
  const { user } = useAuth();

  const [isComplete, setIsComplete] = useState(initialIsComplete);
  const [submission, setSubmission] = useState<QuizSubmission | null>(
    initialSubmission
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Populate answers from existing submission
  const initialAnswers: Record<string, string> = {};
  if (initialSubmission) {
    for (const answer of initialSubmission.answers || []) {
      initialAnswers[answer.question_id] = answer.selected_option_id;
    }
  }
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);

  const seedKey = useMemo(
    () => `quiz_session_seed_${quiz.quiz_id}_${user?.id ?? "anon"}`,
    [quiz.quiz_id, user?.id]
  );

  // Use the raw seedKey on the initial render so server and client match (avoids hydration mismatch).
  // After mount, switch to the real session seed from sessionStorage.
  const [sessionSeed, setSessionSeed] = useState(seedKey);
  useEffect(() => {
    setSessionSeed(getSessionSeed(seedKey));
  }, [seedKey]);
  const displayQuestions = useMemo(() => {
    const baseQuestions = [...quiz.questions].sort((a, b) => a.order - b.order);
    const orderedQuestions = quiz.randomize_questions
      ? shuffleWithSeed(baseQuestions, sessionSeed)
      : baseQuestions;
    return orderedQuestions.map((q) => ({
      ...q,
      id: q.id || `order-${q.order}`,
      options: quiz.randomize_options
        ? shuffleWithSeed(q.options, `${sessionSeed}:${q.order}`)
        : q.options,
    }));
  }, [quiz, sessionSeed]);

  const tracking = useActivityTrackingContext();

  useComponentCloseTracking({
    componentType: "quiz",
    componentId: quiz.quiz_id,
  });

  const emitQuizEvent = (eventType: "submit_clicked") => {
    void emitActivityEvent({
      eventType,
      componentType: "quiz",
      componentId: quiz.quiz_id,
      userId: tracking.userId,
      classId: tracking.classId,
      submissionId: tracking.submissionId,
    });
  };
  const { emitBack, emitClose, emitNextItem } = useNavigationTracking({
    componentType: "quiz",
    componentId: quiz.quiz_id,
  });

  const handleSelectAnswer = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  };

  const handleSubmit = async () => {
    if (!quiz || submission) return;
    emitQuizEvent("submit_clicked");
    const allAnswered = displayQuestions.every((q) => answers[q.id]);
    if (!allAnswered) {
      showErrorToast("Please answer all questions before submitting.");
      return;
    }

    const payload: QuizSubmissionAnswer[] = displayQuestions.map((q) => ({
      question_id: q.id,
      selected_option_id: answers[q.id],
    }));

    setIsSubmitting(true);
    try {
      const created = await createQuizSubmission({
        quiz_id: quiz.id,
        class_id: quiz.class_id,
        answers: payload,
      });
      setSubmission(created);
      setIsComplete(true);
      if (contentItemId) {
        await markContentAsComplete(contentItemId);
        await invalidateCompletionsCache();
      }
      showSuccessToast("Quiz submitted!");
    } catch (submitErr) {
      console.error("Error submitting quiz:", submitErr);
      showErrorToast("Failed to submit quiz. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const showPoints = quiz.show_points_to_students ?? true;
  const scoreSummary = submission
    ? calculateQuizScore(quiz, submission.answers || [])
    : null;
  const canSubmit = displayQuestions.every((q) => !!answers[q.id]);

  return (
    <PageLayout>
      <div>
        <div>
          <div className="mb-4">
            <GoToClassButton classId={classId} onBeforeNavigate={emitBack} />
          </div>
          <div className="mb-6">
            <PageTitle
              title={quiz.title}
              badge={
                isComplete ? (
                  <Pill purpose="contentCompleted" className="w-fit">
                    Completed
                  </Pill>
                ) : null
              }
            />
            {showPoints ? (
              <div className="flex items-center gap-4 mt-1 text-muted-foreground">
                <p>{quiz.total_points} points total</p>
              </div>
            ) : null}
            {quiz.instructions && (
              <div className="mt-3">
                <MarkdownContent content={quiz.instructions} />
              </div>
            )}
          </div>

          <div className="space-y-4 pb-8">
            {displayQuestions.map((q) => (
              <QuizQuestionCard
                key={q.id}
                question={q}
                selectedOptionId={answers[q.id]}
                showPoints={showPoints}
                disabled={!!submission}
                onSelect={(optionId) => handleSelectAnswer(q.id, optionId)}
              />
            ))}

            <QuizSubmissionBar
              isSubmitted={!!submission}
              isSubmitting={isSubmitting}
              canSubmit={canSubmit}
              showPoints={showPoints}
              earnedPoints={scoreSummary?.earnedPoints ?? null}
              totalPoints={scoreSummary?.totalPoints ?? null}
              onSubmit={handleSubmit}
            />

            {contentItemId && (
              <NextItemButton
                classDbId={classUuid}
                classId={classId}
                contentItemId={contentItemId}
                onBeforeNavigate={emitNextItem}
              />
            )}
            <CloseButton
              href={`/student/classes/${classId}`}
              onBeforeNavigate={emitClose}
            />
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

interface QuizDetailClientProps {
  quiz: Quiz;
  contentItemId: string | null;
  isComplete: boolean;
  existingSubmission: QuizSubmission | null;
  classUuid: string | null;
  classId: string;
}

export default function QuizDetailClient({
  quiz,
  contentItemId,
  isComplete,
  existingSubmission,
  classUuid,
  classId,
}: QuizDetailClientProps) {
  const { user } = useAuth();

  return (
    <ActivityTrackingProvider userId={user?.id} classId={classUuid ?? classId}>
      <QuizInner
        quiz={quiz}
        classId={classId}
        classUuid={classUuid}
        contentItemId={contentItemId}
        initialIsComplete={isComplete}
        existingSubmission={existingSubmission}
      />
    </ActivityTrackingProvider>
  );
}
