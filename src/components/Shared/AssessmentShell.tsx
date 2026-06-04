"use client";

import React, { useCallback, useRef } from "react";
import { Question, BotPromptConfig } from "@/types/assignment";
import { SubmissionAttempt } from "@/types/submission";
import { useQuestionAttempts } from "@/hooks/swr";
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
import { CheckCircle2, Loader2 } from "lucide-react";
import { VoiceInputArea } from "@/components/Shared/AssessmentInputs/VoiceInputArea";
import { ChatInputArea } from "@/components/Shared/AssessmentInputs/ChatInputArea";
import { StaticTextInputArea } from "@/components/Shared/AssessmentInputs/StaticTextInputArea";
import { MultimodalInputArea } from "@/components/Shared/AssessmentInputs/MultimodalInputArea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { FeedbackPendingBanner } from "@/components/Shared/FeedbackPendingBanner";
import { showErrorToast, showWarningToast } from "@/lib/toast";
import { AssessmentTrackingProvider } from "@/contexts/AssessmentTrackingContext";
import { getLocaleLabel } from "@/lib/locales";
import { supportedLanguages } from "@/utils/supportedLanguages";

// Sentinel for the "None" choice in the support-language selector. Maps to an
// empty support language downstream, which turns off all language-support
// features (the lightbulb help button, the support directive, support-language
// feedback) while keeping the option visible in the dropdown.
const SUPPORT_LANGUAGE_NONE = "__none__";

export interface AssessmentShellProps {
  assessmentMode: "voice" | "text_chat" | "static_text" | "multimodal";
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
  title,
  studentInstructions,
}: AssessmentShellProps) {
  const [isEvaluating, setIsEvaluating] = React.useState(false);
  const [showCompletion, setShowCompletion] = React.useState(false);
  const [languageDisabled, setLanguageDisabled] = React.useState(false);
  const [navigationDisabled, setNavigationDisabled] = React.useState(false);
  // When feedback requires approval, flip this true immediately on submit so the
  // student sees the pending view right away instead of watching the evaluating spinner.
  const [submittingForApproval, setSubmittingForApproval] = React.useState(false);
  const navigationRef = useRef<AssessmentNavigationHandle>(null);

  // Existing attempts for this question. Driven by SWR so the global
  // overlay covers the load and the cache is shared across remounts.
  const attemptsQuery = useQuestionAttempts({
    submissionId,
    questionOrder: question.order,
    excludeStale: true,
  });
  const attempts = React.useMemo(
    () => attemptsQuery.data ?? [],
    [attemptsQuery.data]
  );
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

        attemptsQuery.mutate(
          (prev) => [...(prev ?? []), newAttempt],
          false
        );
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
      attemptsQuery,
    ],
  );

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
    (assessmentMode === "voice" ||
      assessmentMode === "text_chat" ||
      assessmentMode === "multimodal");
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
              {assessmentMode === "text_chat" && <ChatInputArea {...inputProps} />}
              {assessmentMode === "static_text" && <StaticTextInputArea {...inputProps} />}
              {assessmentMode === "multimodal" && (
                <MultimodalInputArea
                  {...inputProps}
                  supportLanguage={effectiveSupportLanguage}
                />
              )}
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
