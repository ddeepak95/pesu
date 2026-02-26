"use client";

import React, { useCallback, useRef } from "react";
import { Question, BotPromptConfig } from "@/types/assignment";
import { SubmissionAttempt } from "@/types/submission";
import { getQuestionAttempts } from "@/lib/queries/submissions";
import {
  interpolatePrompt,
  buildRuntimeContext,
} from "@/lib/promptInterpolation";
import { AssessmentQuestionHeader } from "@/components/Shared/AssessmentQuestionHeader";
import { AssessmentQuestionCard } from "@/components/Shared/AssessmentQuestionCard";
import {
  AssessmentNavigation,
  type AssessmentNavigationHandle,
} from "@/components/Shared/AssessmentNavigation";
import { QuestionCompletionPanel } from "@/components/Shared/QuestionCompletionPanel";
import { useActivityTracking } from "@/hooks/useActivityTracking";
import { Loader2 } from "lucide-react";
import { VoiceInputArea } from "@/components/Shared/AssessmentInputs/VoiceInputArea";
import { ChatInputArea } from "@/components/Shared/AssessmentInputs/ChatInputArea";
import { StaticTextInputArea } from "@/components/Shared/AssessmentInputs/StaticTextInputArea";

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
  currentAttemptNumber?: number;
  maxAttempts?: number;
  maxAttemptsReached?: boolean;
  botPromptConfig?: BotPromptConfig;
  contentItemId?: string | null;
  showRubric?: boolean;
  showRubricPoints?: boolean;
  useStarDisplay?: boolean;
  starScale?: number;
  requireAllAttempts?: boolean;
  allQuestionsHaveAttempts?: boolean;
  questionsWithAttempts?: Set<number>;
  onAttemptCreated?: () => void;
  onMarkedComplete?: () => void;
  isComplete?: boolean;
  sharedContext?: string;
  evaluationPrompt?: string;
  experienceRatingEnabled?: boolean;
  experienceRatingRequired?: boolean;
  onClose?: () => void;
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
  maxAttemptsReached,
  botPromptConfig,
  contentItemId,
  showRubric = true,
  showRubricPoints = true,
  useStarDisplay = false,
  starScale = 5,
  requireAllAttempts = false,
  allQuestionsHaveAttempts = true,
  questionsWithAttempts,
  onAttemptCreated,
  onMarkedComplete,
  isComplete = false,
  sharedContext,
  evaluationPrompt,
  experienceRatingEnabled = false,
  experienceRatingRequired = false,
  onClose,
}: AssessmentShellProps) {
  const [isEvaluating, setIsEvaluating] = React.useState(false);
  const [isLoadingAttempts, setIsLoadingAttempts] = React.useState(true);
  const [attempts, setAttempts] = React.useState<SubmissionAttempt[]>([]);
  const [showCompletion, setShowCompletion] = React.useState(false);
  const [languageDisabled, setLanguageDisabled] = React.useState(false);
  const [navigationDisabled, setNavigationDisabled] = React.useState(false);
  const navigationRef = useRef<AssessmentNavigationHandle>(null);

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
        alert("You have reached the maximum number of attempts for this question.");
        return;
      }

      setIsEvaluating(true);
      try {
        let interpolatedEvalPrompt: string | undefined;
        if (evaluationPrompt) {
          const assignmentForInterpolation = {
            questions: [question],
            max_attempts: maxAttempts || 1,
            bot_prompt_config: botPromptConfig,
            shared_context: sharedContext,
          };
          const evalContext = buildRuntimeContext(
            assignmentForInterpolation as Parameters<typeof buildRuntimeContext>[0],
            question,
            language,
            attempts.length + 1,
            question.order,
            answerText,
          );
          interpolatedEvalPrompt = interpolatePrompt(evaluationPrompt, evalContext);
        }

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
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Evaluation failed");
        }

        const result = await response.json();
        const newAttempt = result.attempt as SubmissionAttempt;
        if (!newAttempt) {
          throw new Error("No attempt data received from evaluation API");
        }

        setAttempts((prev) => [...prev, newAttempt]);
        setShowCompletion(true);
        onAnswerSave(answerText);
        logEvent("attempt_ended");
        onAttemptCreated?.();
      } catch (error) {
        console.error("Error evaluating answer:", error);
        alert(
          `Failed to evaluate your answer: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      } finally {
        setIsEvaluating(false);
      }
    },
    [
      maxAttemptsReached, evaluationPrompt, question, maxAttempts,
      botPromptConfig, sharedContext, language, attempts.length,
      submissionId, onAnswerSave, logEvent, onAttemptCreated,
    ],
  );

  const handleSaveAndNavigate = (action: "previous" | "next") => {
    if (action === "previous" && onPrevious) {
      onPrevious();
    } else if (action === "next" && onNext) {
      onNext();
    }
  };

  const latestAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;
  const remainingAttempts = maxAttempts ? maxAttempts - attempts.length : null;

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
  };

  return (
    <div className="space-y-2 w-full">
      <AssessmentQuestionHeader
        questionNumber={questionNumber}
        totalQuestions={totalQuestions}
        language={language}
        onLanguageChange={onLanguageChange}
        languageDisabled={languageDisabled || isEvaluating}
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
