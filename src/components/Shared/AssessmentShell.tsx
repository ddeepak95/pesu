"use client";

import React, { useCallback, useRef } from "react";
import { Question, BotPromptConfig } from "@/types/assignment";
import { SubmissionAttempt } from "@/types/submission";
import { useQuestionAttemptsNormalized, selectAttempt } from "@/hooks/swr";
import { useMultimodalSpeechModels } from "@/hooks/swr/useMultimodalSpeechModels";
import { useInterpolatedPrompts } from "@/hooks/useInterpolatedPrompts";
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
import { StaticTextInputArea } from "@/components/Shared/AssessmentInputs/StaticTextInputArea";
import { MultimodalInputArea } from "@/components/Shared/AssessmentInputs/MultimodalInputArea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { showErrorToast, showWarningToast } from "@/lib/toast";
import { RetryErrorCard } from "@/components/ui/retry-error-card";
import type { ClassifiedAiError } from "@/lib/ai/errors";
import { AssessmentTrackingProvider } from "@/contexts/AssessmentTrackingContext";
import { getLocaleLabel } from "@/lib/locales";
import { supportedLanguages } from "@/utils/supportedLanguages";

// Sentinel for the "None" choice in the support-language selector. Maps to an
// empty support language downstream, which turns off all language-support
// features (the lightbulb help button, the support directive, support-language
// feedback) while keeping the option visible in the dropdown.
const SUPPORT_LANGUAGE_NONE = "__none__";

export interface AssessmentShellProps {
  assessmentMode: "voice" | "static_text" | "multimodal";
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
  /** When true, the student can't change the primary language (shown disabled). */
  languageLocked?: boolean;
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
  /** Voice: true while the microphone permission request is in flight (getUserMedia pending). */
  onVoiceMicPermissionRequestPendingChange?: (pending: boolean) => void;
  /** Override the header label (default "Question") */
  headerLabel?: string;
  /** Override the number shown in the header (defaults to questionNumber) */
  headerQuestionNumber?: number;
  /** Override the total shown in the header (defaults to totalQuestions) */
  headerTotalQuestions?: number;
  /** Pre-fetched formatted content of uploaded files for prompt interpolation */
  fileSubmissionsContent?: string;
  /** Activity type for prompt defaults */
  activityType?: import("@/lib/activityTypes/types").ActivityTypeKind;
  /** The assignment's self-contained definition snapshot (action↔type wiring). */
  activityDefinitionSnapshot?:
    | import("@/lib/activityTypes/templates").TemplateDefinition
    | null;
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
  languageLocked = false,
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
  onVoiceMicPermissionRequestPendingChange,
  headerLabel,
  headerQuestionNumber,
  headerTotalQuestions,
  fileSubmissionsContent,
  activityType = "learning",
  activityDefinitionSnapshot,
  title,
  studentInstructions,
}: AssessmentShellProps) {
  const [isEvaluating, setIsEvaluating] = React.useState(false);
  // Set when an evaluation fails; drives the in-place retry card. The answer is
  // safe (input areas keep their state), so the retry re-runs with it.
  const [evaluationFailure, setEvaluationFailure] = React.useState<{
    answerText: string;
    error: ClassifiedAiError;
  } | null>(null);
  const [showCompletion, setShowCompletion] = React.useState(false);
  const [languageDisabled, setLanguageDisabled] = React.useState(false);
  const [navigationDisabled, setNavigationDisabled] = React.useState(false);
  const navigationRef = useRef<AssessmentNavigationHandle>(null);

  // Existing attempts for this question (normalized read). Driven by SWR so the
  // global overlay covers the load and the cache is shared across remounts.
  const attemptsQuery = useQuestionAttemptsNormalized({
    submissionId,
    questionOrder: question.order,
    excludeStale: true,
  });
  const attempts = React.useMemo(
    () => attemptsQuery.data?.attempts ?? [],
    [attemptsQuery.data]
  );
  const selectedAttemptId = attemptsQuery.data?.selectedAttemptId ?? null;
  // The whole-submission release flag (drives tentative-vs-final per attempt).
  const released = attemptsQuery.data?.released ?? false;
  const isLoadingAttempts = attemptsQuery.isLoading;

  // When SWR returns attempts, ensure the completion panel reflects them.
  // Using the "store information from previous render" pattern instead of an
  // effect avoids cascading renders flagged by react-hooks/set-state-in-effect.
  const [seenAttemptsKey, setSeenAttemptsKey] = React.useState<string | null>(
    null
  );
  const attemptsKey = `${submissionId}::${question.order}`;
  if (
    !attemptsQuery.isLoading &&
    attemptsQuery.data !== undefined &&
    seenAttemptsKey !== attemptsKey
  ) {
    setSeenAttemptsKey(attemptsKey);
    setShowCompletion(attempts.length > 0);
  }

  const maxAttemptsReached = maxAttempts != null && attempts.length >= maxAttempts;

  const isMultimodal = assessmentMode === "multimodal";
  const { data: multimodalSpeechModels } = useMultimodalSpeechModels(
    isMultimodal ? assignmentId : null,
  );
  const multimodalLocalesLoading = isMultimodal && multimodalSpeechModels === undefined;
  const multimodalSupportedLocales = React.useMemo(
    () => multimodalSpeechModels?.supportedLocales ?? [],
    [multimodalSpeechModels],
  );
  const multimodalNoLocales =
    isMultimodal &&
    multimodalSpeechModels !== undefined &&
    multimodalSupportedLocales.length === 0;

  const languageOptions = React.useMemo(() => {
    if (isMultimodal && multimodalSpeechModels) {
      return multimodalSupportedLocales.map((code) => ({
        value: code,
        label: getLocaleLabel(code),
      }));
    }
    return supportedLanguages.map((lang) => ({
      value: lang.code,
      label: lang.name,
    }));
  }, [isMultimodal, multimodalSpeechModels, multimodalSupportedLocales]);

  React.useEffect(() => {
    if (!isMultimodal || !multimodalSpeechModels) return;
    const { supportedLocales } = multimodalSpeechModels;
    if (supportedLocales.length === 0) return;
    if (!supportedLocales.includes(language)) {
      onLanguageChange?.(supportedLocales[0]);
    }
  }, [isMultimodal, language, multimodalSpeechModels, onLanguageChange]);

  // Language Support: an additional language the tutor can re-explain in.
  // Chosen here, alongside the main language, before the activity starts.
  const languageSupportConfig = botPromptConfig?.multimodal_actions?.languageSupport;
  // Support is configurable for every interaction type (feeds {{support_language}}),
  // but the in-activity selector — letting learners re-explain in another language —
  // is multimodal-only.
  const supportConfigEnabled = languageSupportConfig?.enabled ?? false;
  const showSupportSelector = isMultimodal && supportConfigEnabled;
  const supportLocked = languageSupportConfig?.locked ?? false;
  const supportLanguageOptions = React.useMemo(() => {
    if (!showSupportSelector) return [];
    return multimodalSupportedLocales
      .filter((code) => code !== language)
      .map((code) => ({ value: code, label: getLocaleLabel(code) }));
  }, [showSupportSelector, multimodalSupportedLocales, language]);
  const [supportLanguage, setSupportLanguage] = React.useState<string>(
    languageSupportConfig?.defaultLanguage ?? "",
  );
  // Keep the support language valid: locked → teacher default; otherwise keep
  // the current pick (including an explicit "None"), falling back to the default
  // or the first option.
  React.useEffect(() => {
    if (!showSupportSelector) return;
    if (supportLocked && languageSupportConfig?.defaultLanguage) {
      setSupportLanguage(languageSupportConfig.defaultLanguage);
      return;
    }
    if (supportLanguageOptions.length === 0) return;
    setSupportLanguage((prev) => {
      // The student explicitly turned support off — don't auto-fill it back.
      if (prev === SUPPORT_LANGUAGE_NONE) return prev;
      if (prev && supportLanguageOptions.some((o) => o.value === prev)) {
        return prev;
      }
      const fallback = languageSupportConfig?.defaultLanguage;
      if (fallback && supportLanguageOptions.some((o) => o.value === fallback)) {
        return fallback;
      }
      return supportLanguageOptions[0]?.value ?? prev;
    });
  }, [
    showSupportSelector,
    supportLocked,
    languageSupportConfig?.defaultLanguage,
    supportLanguageOptions,
  ]);

  // The selector lets the student opt out via "None" (unless the teacher locked
  // the support language). The sentinel maps to an empty effective language,
  // which disables every support feature downstream.
  const supportLanguageSelectOptions = React.useMemo(
    () =>
      supportLocked
        ? supportLanguageOptions
        : [
            { value: SUPPORT_LANGUAGE_NONE, label: "None" },
            ...supportLanguageOptions,
          ],
    [supportLocked, supportLanguageOptions],
  );
  // Non-multimodal modes have no in-activity selector, so the support language is
  // the teacher-configured default; multimodal uses the learner's pick ("None" → "").
  const effectiveSupportLanguage = !supportConfigEnabled
    ? ""
    : isMultimodal
      ? supportLanguage === SUPPORT_LANGUAGE_NONE
        ? ""
        : supportLanguage
      : (languageSupportConfig?.defaultLanguage ?? "");

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
    supportLanguage: effectiveSupportLanguage,
    title,
    studentInstructions,
    totalQuestions,
  });

  const { logEvent } = useActivityTracking({
    componentType: "question",
    componentId: assignmentId,
    subComponentId: String(question.order),
  });


  const handleEvaluate = useCallback(
    async (answerText: string) => {
      if (maxAttemptsReached) {
        showWarningToast(
          "You have reached the maximum number of attempts for this question.",
        );
        return;
      }

      logEvent("submit_clicked");

      setIsEvaluating(true);
      // Clear any prior failure — a fresh submission supersedes it.
      setEvaluationFailure(null);

      try {
        const interpolatedEvalPrompt = buildEvaluationPrompt(answerText);

        // Synchronous evaluation: the route persists the attempt (tentative when
        // approval is required, released otherwise) and returns the full attempt.
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
          const err = new Error(
            errorData.error || "Evaluation failed",
          ) as Error & { classified?: ClassifiedAiError };
          err.classified = {
            code: errorData.code ?? "UNKNOWN",
            message:
              errorData.details || errorData.error || "Evaluation failed",
            retryable: errorData.retryable ?? true,
            ...(errorData.retryAfterMs
              ? { retryAfterMs: errorData.retryAfterMs }
              : {}),
          };
          throw err;
        }

        const result = await response.json();
        const newAttempt = result.attempt as SubmissionAttempt;
        if (!newAttempt) throw new Error("No attempt data received from evaluation API");

        // Optimistically append the new attempt; default selection = last (this one).
        attemptsQuery.mutate(
          (prev) => ({
            attempts: [...(prev?.attempts ?? []), newAttempt],
            selectedAttemptId: newAttempt.id,
            released: newAttempt.released,
            nextAttemptNumber: Math.max(
              prev?.nextAttemptNumber ?? 1,
              newAttempt.attempt_number + 1,
            ),
          }),
          false
        );
        // Revalidate from the DB so the persisted state is authoritative.
        attemptsQuery.mutate();
        setShowCompletion(true);
        onAnswerSave(answerText);
        logEvent("attempt_ended");
        onAttemptCreated?.();
      } catch (error) {
        console.error("Error evaluating answer:", error);
        const classified: ClassifiedAiError = (
          error as { classified?: ClassifiedAiError }
        ).classified ?? {
          code: "NETWORK",
          message: error instanceof Error ? error.message : "Unknown error",
          retryable: true,
        };
        // Show the in-place retry card; the answer is preserved by the input
        // area's own state. Suppress the duplicate toast for retryable errors
        // (the card replaces it); keep it for positively-permanent failures.
        setEvaluationFailure({ answerText, error: classified });
        if (!classified.retryable) {
          showErrorToast(
            `Failed to evaluate your answer: ${classified.message}`,
          );
        }
        // Keep the re-throw so input areas retain their answer-preservation.
        throw error;
      } finally {
        setIsEvaluating(false); // Safety net for all paths
      }
    },
    [
      maxAttemptsReached, buildEvaluationPrompt, question,
      sharedContext, language, submissionId, onAnswerSave,
      logEvent, onAttemptCreated, feedbackRequiresApproval,
      attemptsQuery,
    ],
  );

  // Retry a failed evaluation with the same (preserved) answer. handleEvaluate
  // re-throws, so swallow here — it already records any new failure.
  const retryEvaluation = useCallback(() => {
    const failed = evaluationFailure;
    if (!failed || isEvaluating) return;
    void handleEvaluate(failed.answerText).catch(() => {});
  }, [evaluationFailure, isEvaluating, handleEvaluate]);

  const handleSaveAndNavigate = (action: "previous" | "next") => {
    if (action === "previous" && onPrevious) {
      logEvent("question_previous_clicked");
      onPrevious();
    } else if (action === "next" && onNext) {
      // Only count as "next question" when we are actually moving to another
      // question. The same onNext callback is also used for finish/complete
      // flows on the last question.
      if (!isLastQuestion) {
        logEvent("question_next_clicked");
      }
      onNext();
    }
  };

  const latestAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;
  const remainingAttempts = maxAttempts ? maxAttempts - attempts.length : null;

  const tabTrackingInputsActive =
    !isComplete &&
    !isLoadingAttempts &&
    !(showCompletion && latestAttempt) &&
    !isEvaluating;

  React.useEffect(() => {
    onTabTrackingActiveChange?.(tabTrackingInputsActive);
    return () => {
      onTabTrackingActiveChange?.(false);
    };
  }, [tabTrackingInputsActive, onTabTrackingActiveChange]);

  // An attempt's grade is tentative when the assignment requires approval and the
  // submission has not been released. The score/feedback are shown openly with a
  // tentative banner; this is persisted, so it survives leaving and returning.
  const tentative = feedbackRequiresApproval && !released;

  // Selection: the student may change the counted attempt only before they finish.
  const selectionEditable = !isComplete;
  const selectedAttemptNumber =
    attempts.find((a) => a.id === selectedAttemptId)?.attempt_number ?? null;
  const handleSelectAttempt = React.useCallback(
    (attemptNumber: number) => {
      void selectAttempt({
        submissionId,
        questionOrder: question.order,
        attemptNumber,
      }).then((res) => {
        if (!res.ok) {
          showErrorToast("Could not change the selected attempt.");
        }
      });
    },
    [submissionId, question.order],
  );

  const inputProps = {
    question,
    language,
    assignmentId,
    submissionId,
    existingAnswer,
    maxAttemptsReached,
    attempts,
    nextAttemptNumber: attemptsQuery.data?.nextAttemptNumber ?? attempts.length + 1,
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
    activityDefinitionSnapshot,
    title,
    studentInstructions,
    onVoiceMicPermissionRequestPendingChange,
  };

  const trackingContextValue = React.useMemo(
    () => ({
      trackFeedbackOpened: () => logEvent("feedback_view_clicked"),
      trackFinishMarkCompleteClicked: () =>
        logEvent("finish_mark_complete_clicked"),
    }),
    [logEvent]
  );

  const languageSelectorDisabled =
    languageDisabled ||
    isEvaluating ||
    multimodalLocalesLoading ||
    multimodalNoLocales;

  const showInCardLanguageSelector =
    Boolean(onLanguageChange) &&
    // Hide the language selectors once the activity has started; before that
    // they show (disabled when teacher-locked).
    !languageDisabled &&
    (assessmentMode === "voice" || assessmentMode === "multimodal");
  const handleLanguageValueChange = React.useCallback(
    (nextLanguage: string) => {
      onLanguageChange?.(nextLanguage);
    },
    [onLanguageChange],
  );

  return (
    <AssessmentTrackingProvider value={trackingContextValue}>
      <div className="space-y-2 w-full">
        <AssessmentQuestionHeader
          questionNumber={headerQuestionNumber ?? questionNumber}
          totalQuestions={headerTotalQuestions ?? totalQuestions}
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
          ) : showCompletion && latestAttempt ? (
            <QuestionCompletionPanel
              attempt={latestAttempt}
              attempts={attempts}
              selectedAttemptNumber={selectedAttemptNumber}
              onSelectAttempt={handleSelectAttempt}
              selectionEditable={selectionEditable}
              useStarDisplay={useStarDisplay}
              starScale={starScale}
              onNext={() => handleSaveAndNavigate("next")}
              onTryAgain={() => setShowCompletion(false)}
              onFinish={() => navigationRef.current?.triggerFinish()}
              remainingAttempts={remainingAttempts}
              isLastQuestion={isLastQuestion}
              isComplete={isComplete}
              contentItemId={contentItemId}
              tentative={tentative}
            />
          ) : (
            <>
              {showInCardLanguageSelector && (
                <div className="flex flex-col items-center justify-center gap-1">
                  <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <span>
                          {activityType === "speaking_practice"
                            ? showSupportSelector
                              ? "Learning language:"
                              : "Language:"
                            : showSupportSelector
                              ? "Primary language:"
                              : "Language:"}
                        </span>
                        <InfoTooltip
                          text={
                            activityType === "speaking_practice"
                              ? "The language you are learning and will speak during the role-play."
                              : "The main language the AI tutor speaks and converses in throughout the activity."
                          }
                        />
                      </div>
                      <SearchableSelect
                        value={language}
                        onValueChange={handleLanguageValueChange}
                        options={languageOptions}
                        placeholder="Select language..."
                        disabled={languageSelectorDisabled || languageLocked}
                        className="w-[180px]"
                      />
                    </div>
                    {showSupportSelector && supportLanguageOptions.length > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <span>Support language:</span>
                          <InfoTooltip
                            text={
                              activityType === "speaking_practice"
                                ? "Your native or support language. Tap the lightbulb (💡) to get a suggested response in the learning language, with a translation below."
                                : "An extra language the tutor can re-explain a point in when you tap the lightbulb (💡) help button. Technical terms stay in the primary language."
                            }
                          />
                        </div>
                        <SearchableSelect
                          value={supportLanguage}
                          onValueChange={setSupportLanguage}
                          options={supportLanguageSelectOptions}
                          placeholder="Select language..."
                          disabled={languageSelectorDisabled || supportLocked}
                          className="w-[180px]"
                        />
                      </div>
                    )}
                  </div>
                  {multimodalNoLocales && (
                    <p className="text-xs text-muted-foreground text-center max-w-md">
                      No languages are available for the speech models configured
                      for this class.
                    </p>
                  )}
                </div>
              )}
              {assessmentMode === "voice" && <VoiceInputArea {...inputProps} />}
              {assessmentMode === "static_text" && <StaticTextInputArea {...inputProps} />}
              {assessmentMode === "multimodal" && (
                <MultimodalInputArea
                  {...inputProps}
                  supportLanguage={effectiveSupportLanguage}
                />
              )}
              {evaluationFailure && !isEvaluating ? (
                <div className="mt-3">
                  <RetryErrorCard
                    variant="block"
                    message={
                      evaluationFailure.error.retryable
                        ? "Evaluation failed — your answer is safe."
                        : evaluationFailure.error.message
                    }
                    detail={
                      evaluationFailure.error.retryable
                        ? evaluationFailure.error.message
                        : undefined
                    }
                    retryable={evaluationFailure.error.retryable}
                    retryLabel="Retry evaluation"
                    onRetry={retryEvaluation}
                    disabled={isEvaluating}
                    countdownMs={evaluationFailure.error.retryAfterMs}
                  />
                </div>
              ) : null}
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
    </AssessmentTrackingProvider>
  );
}
