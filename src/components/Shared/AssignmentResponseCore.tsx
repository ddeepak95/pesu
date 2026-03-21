"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Assignment } from "@/types/assignment";
import { AssessmentShell } from "@/components/Shared/AssessmentShell";
import { updateQuestionIndex } from "@/utils/sessionStorage";
import { useActivityTracking } from "@/hooks/useActivityTracking";
import { getQuestionAttempts } from "@/lib/queries/submissions";
import { getEffectiveAllowCopyPaste } from "@/lib/integrity/assignmentPolicy";
import { isContentComplete } from "@/lib/queries/contentCompletions";
import MarkdownContent from "@/components/Shared/MarkdownContent";
import PageTitle from "@/components/Shared/PageTitle";
import { TabSwitchWarningDialog } from "@/components/Shared/Integrity/TabSwitchWarningDialog";
import { useTabLeaveTracking } from "@/hooks/useTabLeaveTracking";

interface AssignmentResponseCoreProps {
  assignmentData: Assignment;
  submissionId: string; // Required - must be provided by wrapper
  displayName: string; // For display in header - derived from responder_details or user
  preferredLanguage: string;
  contentItemId?: string | null; // For marking as complete
  onComplete?: () => void;
  onBack?: () => void;
  onLanguageChange?: (lang: string) => void;
  assignmentId: string; // For session storage
  initialQuestionIndex?: number; // Initial question index
  existingAnswers?: { [key: number]: string }; // Existing answers to restore
  currentAttemptNumber?: number; // Current attempt number (for student assignments)
  maxAttempts?: number; // Maximum attempts allowed
  maxAttemptsReached?: boolean; // Whether max attempts have been reached
  /** When server returns integrity lock during evaluate */
  onIntegrityAccessRevoked?: () => void;
  /** True when the wrapper is showing the integrity-revoked screen (hook safety; Core usually unmounts). */
  integrityAccessRevoked?: boolean;
  // Note: classId and userId for activity tracking are provided via ActivityTrackingContext
}

/**
 * Core assessment component that handles question answering logic
 * Does not handle entry flow (responder details form, auto-start)
 * Must be wrapped by PublicAssignmentResponse or StudentAssignmentResponse
 */
export default function AssignmentResponseCore({
  assignmentData,
  submissionId,
  preferredLanguage: initialPreferredLanguage,
  contentItemId,
  onComplete,
  onBack: _onBack,
  onLanguageChange,
  assignmentId,
  initialQuestionIndex = 0,
  existingAnswers = {},
  currentAttemptNumber,
  maxAttempts,
  maxAttemptsReached,
  onIntegrityAccessRevoked,
  integrityAccessRevoked = false,
}: AssignmentResponseCoreProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] =
    useState(initialQuestionIndex);
  const [answers, setAnswers] = useState<{ [key: number]: string }>(
    existingAnswers,
  );
  const [isComplete, setIsComplete] = useState(false);
  // Use assignment's preferred_language as fallback if initialPreferredLanguage is empty
  const [preferredLanguage, setPreferredLanguage] = useState(
    initialPreferredLanguage || assignmentData.preferred_language || "en",
  );

  // Track which questions have at least one attempt
  const [questionsWithAttempts, setQuestionsWithAttempts] = useState<
    Set<number>
  >(new Set());

  // Sorted questions for reference
  const sortedQuestions = [...assignmentData.questions].sort(
    (a, b) => a.order - b.order,
  );

  // Function to check attempts for all questions
  const checkAttempts = useCallback(async () => {
    if (!submissionId) return;

    const withAttempts = new Set<number>();
    for (const question of sortedQuestions) {
      try {
        const attempts = await getQuestionAttempts(
          submissionId,
          question.order,
          true, // Exclude stale attempts
        );
        if (attempts.length > 0) {
          withAttempts.add(question.order);
        }
      } catch (error) {
        console.error(
          `Error checking attempts for question ${question.order}:`,
          error,
        );
      }
    }
    setQuestionsWithAttempts(withAttempts);
  }, [submissionId, sortedQuestions]);

  // Check attempts when component mounts and when navigating between questions
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkAttempts();
  }, [checkAttempts, currentQuestionIndex]);

  useEffect(() => {
    let isMounted = true;

    const checkCompletion = async () => {
      if (!contentItemId) {
        if (isMounted) {
          setIsComplete(false);
        }
        return;
      }

      try {
        const completed = await isContentComplete(contentItemId);
        if (isMounted) {
          setIsComplete(completed);
        }
      } catch (error) {
        console.error("Error checking completion status:", error);
      }
    };

    checkCompletion();

    return () => {
      isMounted = false;
    };
  }, [contentItemId]);

  // Callback for assessment components to trigger re-check after new attempt
  const handleAttemptCreated = useCallback(() => {
    checkAttempts();
  }, [checkAttempts]);

  // Determine if all questions have attempts
  const allQuestionsHaveAttempts =
    questionsWithAttempts.size === sortedQuestions.length;

  // 0-based indices of questions that have at least one attempt (for questions-status dialog)
  const completedQuestionIndices = useMemo(
    () =>
      sortedQuestions
        .map((q, i) => i)
        .filter((i) => questionsWithAttempts.has(sortedQuestions[i].order)),
    [sortedQuestions, questionsWithAttempts]
  );

  const handleGoToQuestion = useCallback(
    (index: number) => {
      setCurrentQuestionIndex(index);
      updateQuestionIndex(assignmentId, index);
    },
    [assignmentId]
  );

  // Activity tracking for assignment-level time
  // Uses ActivityTrackingContext for userId, classId, submissionId
  useActivityTracking({
    componentType: "assignment",
    componentId: assignmentId,
  });

  const handleAnswerSave = async (transcript: string) => {
    if (!assignmentData || !submissionId) return;

    const currentQuestion = assignmentData.questions[currentQuestionIndex];

    // Update local state
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.order]: transcript,
    }));

    // Update current question index in localStorage
    updateQuestionIndex(assignmentId, currentQuestionIndex);
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      const newIndex = currentQuestionIndex - 1;
      setCurrentQuestionIndex(newIndex);
      updateQuestionIndex(assignmentId, newIndex);
    }
  };

  const handleNext = () => {
    if (
      assignmentData &&
      currentQuestionIndex < assignmentData.questions.length - 1
    ) {
      const newIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(newIndex);
      updateQuestionIndex(assignmentId, newIndex);
    } else {
      // Reached last question - student can navigate back or finish
      // Attempts are automatically saved, no explicit submission needed
      if (onComplete) {
        onComplete();
      }
    }
  };

  // No explicit submission needed - attempts are automatically saved
  // When student finishes last question, they can navigate back or close

  const handleLanguageChange = (newLanguage: string) => {
    setPreferredLanguage(newLanguage);
    if (onLanguageChange) {
      onLanguageChange(newLanguage);
    }
  };

  // Always show question answering interface - no completion phase needed
  // Attempts are automatically saved as students answer questions
  const currentQuestion = sortedQuestions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === sortedQuestions.length - 1;

  const assessmentMode = assignmentData.assessment_mode ?? "voice";
  const allowCopyPaste = getEffectiveAllowCopyPaste(assignmentData);

  const [tabTrackingActive, setTabTrackingActive] = useState(false);

  const { showTabWarning, dismissTabWarning, tabWarningQuota } =
    useTabLeaveTracking({
      submissionId,
      assignment: assignmentData,
      integrityAccessRevoked,
      active: tabTrackingActive,
      onAccessRevoked: onIntegrityAccessRevoked,
    });

  // If language is locked, don't allow students to change it
  const languageChangeHandler = assignmentData.lock_language
    ? undefined
    : handleLanguageChange;

  return (
    <>
      <TabSwitchWarningDialog
        open={showTabWarning}
        quota={tabWarningQuota}
        onOpenChange={(open) => {
          if (!open) dismissTabWarning();
        }}
      />
      <div className="w-full space-y-6">
      {/* Assignment Title and Language Selector */}
      <PageTitle
        title={assignmentData.title}
        badge={
          isComplete ? (
            <span className="text-xs rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-green-600 dark:text-green-400 w-fit">
              Completed
            </span>
          ) : null
        }
      />

      {/* Instructions (markdown) - shown below the title */}
      {assignmentData.student_instructions && (
        <div className="mt-1">
          <MarkdownContent content={assignmentData.student_instructions} />
        </div>
      )}

      {/* Shared Context is not displayed to students -- it is only passed to AI prompts */}

      {/* Assessment Component */}
      <AssessmentShell
        key={currentQuestion.order}
        assessmentMode={assessmentMode}
        question={currentQuestion}
        language={preferredLanguage}
        assignmentId={assignmentData.assignment_id}
        submissionId={submissionId}
        questionNumber={currentQuestionIndex + 1}
        totalQuestions={sortedQuestions.length}
        onAnswerSave={handleAnswerSave}
        onPrevious={handlePrevious}
        onNext={handleNext}
        isFirstQuestion={currentQuestionIndex === 0}
        isLastQuestion={isLastQuestion}
        existingAnswer={answers[currentQuestion.order]}
        onLanguageChange={languageChangeHandler}
        currentAttemptNumber={currentAttemptNumber}
        maxAttempts={maxAttempts}
        maxAttemptsReached={maxAttemptsReached}
        botPromptConfig={assignmentData.bot_prompt_config}
        contentItemId={contentItemId}
        showRubric={assignmentData.show_rubric ?? true}
        showRubricPoints={assignmentData.show_rubric_points ?? true}
        useStarDisplay={assignmentData.use_star_display ?? false}
        starScale={assignmentData.star_scale ?? 5}
        requireAllAttempts={assignmentData.require_all_attempts ?? false}
        allQuestionsHaveAttempts={allQuestionsHaveAttempts}
        questionsWithAttempts={questionsWithAttempts}
        completedQuestionIndices={completedQuestionIndices}
        onGoToQuestion={handleGoToQuestion}
        onAttemptCreated={handleAttemptCreated}
        onMarkedComplete={() => setIsComplete(true)}
        isComplete={isComplete}
        sharedContext={
          assignmentData.shared_context_enabled
            ? assignmentData.shared_context
            : undefined
        }
        evaluationPrompt={assignmentData.evaluation_prompt}
        experienceRatingEnabled={
          assignmentData.experience_rating_enabled ?? false
        }
        experienceRatingRequired={
          assignmentData.experience_rating_required ?? false
        }
        feedbackRequiresApproval={
          assignmentData.feedback_requires_approval ?? false
        }
        allowCopyPaste={allowCopyPaste}
        onIntegrityAccessRevoked={onIntegrityAccessRevoked}
        onTabTrackingActiveChange={setTabTrackingActive}
      />
    </div>
    </>
  );
}
