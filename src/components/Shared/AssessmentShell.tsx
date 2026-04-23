"use client";

import React, { useCallback, useRef } from "react";
import { Question, BotPromptConfig } from "@/types/assignment";
import { SubmissionAttempt } from "@/types/submission";
import { getQuestionAttempts } from "@/lib/queries/submissions";
import { useInterpolatedPrompts } from "@/hooks/useInterpolatedPrompts";
import { AssessmentQuestionHeader } from "@/components/Shared/AssessmentQuestionHeader";
import { AssessmentQuestionCard } from "@/components/Shared/AssessmentQuestionCard";
import {
  AssessmentNavigation,
  type AssessmentNavigationHandle,
} from "@/components/Shared/AssessmentNavigation";
import { QuestionCompletionPanel } from "@/components/Shared/QuestionCompletionPanel";
import { useActivityTracking } from "@/hooks/useActivityTracking";
import { CheckCircle2, Loader2 } from "lucide-react";
import { VoiceInputArea } from "@/components/Shared/AssessmentInputs/VoiceInputArea";
import { ChatInputArea } from "@/components/Shared/AssessmentInputs/ChatInputArea";
import { StaticTextInputArea } from "@/components/Shared/AssessmentInputs/StaticTextInputArea";
import { FeedbackPendingBanner } from "@/components/Shared/FeedbackPendingBanner";
import { showErrorToast, showWarningToast } from "@/lib/toast";

export interface AssessmentShellProps {
  assessmentMode: "voice" | "text_chat" | "static_text";
  question: Question;
  language: string;
  assignmentId: string;
  submissionId: string;
  questionNumber: number;
  totalQuestions: number;
  onAnswerSave: (answer: string) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  isFirstQuestion: boolean;
  isLastQuestion: boolean;
  existingAnswer?: string;
  onLanguageChange?: (language: string) => void;
  maxAttempts?: number;
  botPromptConfig?: BotPromptConfig;
  contentItemId?: string | null;
  showRubric?: boolean;
  showRubricPoints?: boolean;
  useStarDisplay?: boolean;
  starScale?: number;
  requireAllAttempts?: boolean;
  allQuestionsHaveAttempts?: boolean;
  questionsWithAttempts?: Set<number>;
  completedQuestionIndices?: number[];
  onGoToQuestion?: (index: number) => void;
  onAttemptCreated?: () => void;
  onMarkedComplete?: () => void;
  isComplete?: boolean;
  sharedContext?: string;
  evaluationPrompt?: string;
  experienceRatingEnabled?: boolean;
  experienceRatingRequired?: boolean;
  feedbackRequiresApproval?: boolean;
  onClose?: () => void;
  /** When false (default), text inputs block paste/clipboard shortcuts */
  allowCopyPaste?: boolean;
  /** Fired when the server rejects because the submission is integrity-locked */
  onIntegrityAccessRevoked?: () => void;
  /** When the voice / chat / static input surface is shown (not loading, results, or evaluating). */
  onTabTrackingActiveChange?: (active: boolean) => void;
  /** Override the header label (default "Question") */
  headerLabel?: string;
  /** Override the number shown in the header (defaults to questionNumber) */
  headerQuestionNumber?: number;
  /** Override the total shown in the header (defaults to totalQuestions) */
  headerTotalQuestions?: number;
  /** Pre-fetched formatted content of uploaded files for prompt interpolation */
  fileSubmissionsContent?: string;
  /** Activity type for prompt defaults */
  activityType?: "assessment" | "learning";
  /** Assignment title for prompt interpolation */
  title?: string;
  /** Student instructions for prompt interpolation */
  studentInstructions?: string;
}

export function AssessmentShell({
  assessmentMode,
  question,
  language,
  assignmentId,
  submissionId,
  questionNumber,
  totalQuestions,
  onAnswerSave,
  onPrevious,
  onNext,
  isFirstQuestion,
  isLastQuestion,
  existingAnswer,
  onLanguageChange,
  maxAttempts,
  botPromptConfig,
  contentItemId,
  showRubric = true,
  showRubricPoints = true,
  useStarDisplay = false,
  starScale = 5,
  requireAllAttempts = false,
  allQuestionsHaveAttempts = true,
  questionsWithAttempts,
  completedQuestionIndices,
  onGoToQuestion,
  onAttemptCreated,
  onMarkedComplete,
  isComplete = false,
  sharedContext,
  evaluationPrompt,
  experienceRatingEnabled = false,
  experienceRatingRequired = false,
  feedbackRequiresApproval = false,
  onClose,
  allowCopyPaste = false,
  onIntegrityAccessRevoked,
  onTabTrackingActiveChange,
  headerLabel,
  headerQuestionNumber,
  headerTotalQuestions,
  fileSubmissionsContent,
  activityType = "learning",
  title,
  studentInstructions,
}: AssessmentShellProps) {
  const [isEvaluating, setIsEvaluating] = React.useState(false);
  const [isLoadingAttempts, setIsLoadingAttempts] = React.useState(true);
  const [attempts, setAttempts] = React.useState<SubmissionAttempt[]>([]);
  const [showCompletion, setShowCompletion] = React.useState(false);
  const [languageDisabled, setLanguageDisabled] = React.useState(false);
  const [navigationDisabled, setNavigationDisabled] = React.useState(false);
  // When feedback requires approval, flip this true immediately on submit so the
  // student sees the pending view right away instead of watching the evaluating spinner.
  const [submittingForApproval, setSubmittingForApproval] = React.useState(false);
  const navigationRef = useRef<AssessmentNavigationHandle>(null);

  const maxAttemptsReached = maxAttempts != null && attempts.length >= maxAttempts;

  const { buildEvaluationPrompt } = useInterpolatedPrompts({
    question,
    language,
    attemptCount: attempts.length,
    botPromptConfig,
    maxAttempts,
    sharedContext,
    evaluationPromptTemplate: evaluationPrompt,
    fileSubmissionsContent,
    assessmentMode,
    activityType,
    title,
    studentInstructions,
    totalQuestions,
  });

  const { logEvent } = useActivityTracking({
    componentType: "question",
    componentId: assignmentId,
    subComponentId: String(question.order),
  });

  // Load existing attempts -- show completion panel if any exist
  React.useEffect(() => {
    setAttempts([]);
    setShowCompletion(false);
    setIsLoadingAttempts(true);
    async function loadAttempts() {
      try {
        const questionAttempts = await getQuestionAttempts(
          submissionId,
          question.order,
          true,
        );
        setAttempts(questionAttempts);
        if (questionAttempts.length > 0) {
          setShowCompletion(true);
        }
      } catch (error) {
        console.error("Error loading attempts:", error);
      } finally {
        setIsLoadingAttempts(false);
      }
    }
    loadAttempts();
  }, [question.order, submissionId]);

  const handleEvaluate = useCallback(
    async (answerText: string) => {
      if (maxAttemptsReached) {
        showWarningToast(
          "You have reached the maximum number of attempts for this question.",
        );
        return;
      }

      logEvent("submit_clicked");

      if (feedbackRequiresApproval) {
        // Show pending screen immediately — student won't watch LLM spinner
        setSubmittingForApproval(true);
      }
      setIsEvaluating(true);

      try {
        const interpolatedEvalPrompt = buildEvaluationPrompt(answerText);

        // Single call for both modes. When feedback_requires_approval is true
        // the route saves a stub, schedules the LLM via after(), and returns
        // immediately — so isEvaluating clears fast and navigation is unblocked.
        const response = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submissionId,
            questionOrder: question.order,
            answerText,
            questionPrompt: question.prompt,
            rubric: question.rubric,
            language,
            ...(sharedContext && { shared_context: sharedContext }),
            ...(interpolatedEvalPrompt && {
              custom_evaluation_prompt: interpolatedEvalPrompt,
            }),
            ...(feedbackRequiresApproval && { feedback_requires_approval: true }),
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Evaluation failed");
        }

        const result = await response.json();
        const newAttempt = result.attempt as SubmissionAttempt;
        if (!newAttempt) throw new Error("No attempt data received from evaluation API");

        setAttempts((prev) => [...prev, newAttempt]);
        setSubmittingForApproval(false);
        setShowCompletion(true);
        if (feedbackRequiresApproval) {
          // Unblock navigation immediately — LLM is running server-side
          setIsEvaluating(false);
        }
        onAnswerSave(answerText);
        logEvent("attempt_ended");
        onAttemptCreated?.();
      } catch (error) {
        setSubmittingForApproval(false);
        console.error("Error evaluating answer:", error);
        showErrorToast(
          `Failed to evaluate your answer: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
        throw error;
      } finally {
        setIsEvaluating(false); // Safety net for all paths
      }
    },
    [
      maxAttemptsReached, buildEvaluationPrompt, question,
      sharedContext, language, submissionId, onAnswerSave,
      logEvent, onAttemptCreated, feedbackRequiresApproval,
    ],
  );

  const handleSaveAndNavigate = (action: "previous" | "next") => {
    if (action === "previous" && onPrevious) {
      logEvent("question_previous_clicked");
      onPrevious();
    } else if (action === "next" && onNext) {
      logEvent("question_next_clicked");
      onNext();
    }
  };

  const latestAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;
  const remainingAttempts = maxAttempts ? maxAttempts - attempts.length : null;

  const tabTrackingInputsActive =
    !isComplete &&
    !isLoadingAttempts &&
    !submittingForApproval &&
    !(showCompletion && latestAttempt) &&
    !isEvaluating;

  React.useEffect(() => {
    onTabTrackingActiveChange?.(tabTrackingInputsActive);
    return () => {
      onTabTrackingActiveChange?.(false);
    };
  }, [tabTrackingInputsActive, onTabTrackingActiveChange]);
  // Feedback is pending when the latest attempt explicitly has feedback_approved = false.
  // undefined/absent means approved (instant feedback or legacy attempt).
  const feedbackApprovalPending = latestAttempt?.feedback_approved === false;

  const inputProps = {
    question,
    language,
    assignmentId,
    submissionId,
    existingAnswer,
    maxAttemptsReached,
    attempts,
    isEvaluating,
    onSubmitForEvaluation: handleEvaluate,
    onLanguageDisabledChange: setLanguageDisabled,
    onNavigationDisabledChange: setNavigationDisabled,
    botPromptConfig,
    maxAttempts,
    sharedContext,
    evaluationPrompt,
    allowCopyPaste,
    onIntegrityAccessRevoked,
    fileSubmissionsContent,
    activityType,
    title,
    studentInstructions,
  };

  return (
    <div className="space-y-2 w-full">
      <AssessmentQuestionHeader
        questionNumber={headerQuestionNumber ?? questionNumber}
        totalQuestions={headerTotalQuestions ?? totalQuestions}
        language={language}
        onLanguageChange={onLanguageChange}
        languageDisabled={languageDisabled || isEvaluating}
        label={headerLabel}
      />

      <AssessmentQuestionCard
        question={question}
        showRubric={showRubric}
        showRubricPoints={showRubricPoints}
        className="w-full"
      >
        {isLoadingAttempts ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        ) : submittingForApproval ? (
          <div className="flex flex-col items-center gap-5 py-8">
            <div className="flex items-center gap-1">
              <p className="text-base">Answer submitted</p>
              <CheckCircle2 className="text-green-500 size-4" />
            </div>
            <div className="w-full max-w-xl">
              <FeedbackPendingBanner />
            </div>
          </div>
        ) : showCompletion && latestAttempt ? (
          <QuestionCompletionPanel
            attempt={latestAttempt}
            useStarDisplay={useStarDisplay}
            starScale={starScale}
            onNext={() => handleSaveAndNavigate("next")}
            onTryAgain={() => setShowCompletion(false)}
            onFinish={() => navigationRef.current?.triggerFinish()}
            remainingAttempts={remainingAttempts}
            isLastQuestion={isLastQuestion}
            isComplete={isComplete}
            contentItemId={contentItemId}
            feedbackApprovalPending={feedbackApprovalPending}
            feedbackRequiresApproval={feedbackRequiresApproval}
          />
        ) : (
          <>
            {assessmentMode === "voice" && <VoiceInputArea {...inputProps} />}
            {assessmentMode === "text_chat" && <ChatInputArea {...inputProps} />}
            {assessmentMode === "static_text" && <StaticTextInputArea {...inputProps} />}
          </>
        )}
      </AssessmentQuestionCard>

      <AssessmentNavigation
        ref={navigationRef}
        isFirstQuestion={isFirstQuestion}
        isLastQuestion={isLastQuestion}
        onPrevious={() => handleSaveAndNavigate("previous")}
        onNext={() => handleSaveAndNavigate("next")}
        previousDisabled={navigationDisabled || isEvaluating}
        nextDisabled={navigationDisabled || isEvaluating}
        contentItemId={contentItemId}
        requireAllAttempts={requireAllAttempts}
        allQuestionsHaveAttempts={allQuestionsHaveAttempts}
        questionsWithAttempts={questionsWithAttempts}
        completedQuestionIndices={completedQuestionIndices}
        onGoToQuestion={onGoToQuestion}
        totalQuestions={totalQuestions}
        onMarkedComplete={onMarkedComplete}
        isComplete={isComplete}
        submissionId={submissionId}
        experienceRatingEnabled={experienceRatingEnabled}
        experienceRatingRequired={experienceRatingRequired}
        onClose={onClose}
      />
    </div>
  );
}
