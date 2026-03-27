"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Assignment } from "@/types/assignment";
import { SubmissionFile } from "@/types/submission";
import { AssessmentShell } from "@/components/Shared/AssessmentShell";
import { AssessmentNavigation } from "@/components/Shared/AssessmentNavigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import FileUploadZone from "@/components/Shared/FileUploadZone";
import { updateQuestionIndex } from "@/utils/sessionStorage";
import { useActivityTracking } from "@/hooks/useActivityTracking";
import { getQuestionsWithAttempts } from "@/lib/queries/submissions";
import { getEffectiveAllowCopyPaste } from "@/lib/integrity/assignmentPolicy";
import { isContentComplete } from "@/lib/queries/contentCompletions";
import MarkdownContent from "@/components/Shared/MarkdownContent";
import PageTitle from "@/components/Shared/PageTitle";
import { TabSwitchWarningDialog } from "@/components/Shared/Integrity/TabSwitchWarningDialog";
import { useTabLeaveTracking } from "@/hooks/useTabLeaveTracking";
import { showWarningToast } from "@/lib/toast";

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
  /** When server returns integrity lock during evaluate */
  onIntegrityAccessRevoked?: () => void;
  /** True when the wrapper is showing the integrity-revoked screen (hook safety; Core usually unmounts). */
  integrityAccessRevoked?: boolean;
  // Note: classId and userId for activity tracking are provided via ActivityTrackingContext
  /** File upload integration -- when true, step 0 is a file upload step */
  fileUploadRequired?: boolean;
  uploadedFiles?: SubmissionFile[];
  onUploadedFilesChanged?: (files: SubmissionFile[]) => void;
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
  onIntegrityAccessRevoked,
  integrityAccessRevoked = false,
  fileUploadRequired = false,
  uploadedFiles = [],
  onUploadedFilesChanged,
}: AssignmentResponseCoreProps) {
  const [currentStepIndex, setCurrentStepIndex] =
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

  // Sorted questions — memoized so the reference is stable across renders
  const sortedQuestions = useMemo(
    () => [...assignmentData.questions].sort((a, b) => a.order - b.order),
    [assignmentData.questions],
  );

  const questionOffset = fileUploadRequired ? 1 : 0;
  const totalSteps = sortedQuestions.length + questionOffset;
  const isOnFileUploadStep = fileUploadRequired && currentStepIndex === 0;
  const questionIndex = currentStepIndex - questionOffset;

  // Single-query check: which questions have at least one non-stale attempt?
  const checkAttempts = useCallback(async () => {
    if (!submissionId) return;

    try {
      const withAttempts = await getQuestionsWithAttempts(submissionId);
      setQuestionsWithAttempts(withAttempts);
    } catch (error) {
      console.error("Error checking question attempts:", error);
    }
  }, [submissionId]);

  // Check attempts when component mounts and when navigating between questions
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkAttempts();
  }, [checkAttempts, currentStepIndex]);

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
    (qIdx: number) => {
      const stepIdx = qIdx + questionOffset;
      setCurrentStepIndex(stepIdx);
      updateQuestionIndex(assignmentId, stepIdx);
    },
    [assignmentId, questionOffset]
  );

  // Activity tracking for assignment-level time
  // Uses ActivityTrackingContext for userId, classId, submissionId
  useActivityTracking({
    componentType: "assignment",
    componentId: assignmentId,
  });

  const handleAnswerSave = async (transcript: string) => {
    if (!assignmentData || !submissionId || isOnFileUploadStep) return;

    const currentQuestion = sortedQuestions[questionIndex];

    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.order]: transcript,
    }));

    updateQuestionIndex(assignmentId, currentStepIndex);
  };

  const handlePrevious = () => {
    if (currentStepIndex > 0) {
      const newIndex = currentStepIndex - 1;
      setCurrentStepIndex(newIndex);
      updateQuestionIndex(assignmentId, newIndex);
    }
  };

  const handleNext = () => {
    if (currentStepIndex < totalSteps - 1) {
      const newIndex = currentStepIndex + 1;
      setCurrentStepIndex(newIndex);
      updateQuestionIndex(assignmentId, newIndex);
    } else {
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

  const currentQuestion = isOnFileUploadStep ? null : sortedQuestions[questionIndex];
  const isLastQuestion = !isOnFileUploadStep && questionIndex === sortedQuestions.length - 1;

  const assessmentMode = assignmentData.assessment_mode ?? "voice";
  const allowCopyPaste = getEffectiveAllowCopyPaste(assignmentData);

  const [fileSubmissionsContent, setFileSubmissionsContent] = useState<
    string | undefined
  >(undefined);

  useEffect(() => {
    if (!fileUploadRequired || !submissionId) return;
    let cancelled = false;

    async function fetchContent() {
      try {
        const res = await fetch(
          `/api/files/submission-content?submissionId=${encodeURIComponent(submissionId)}`,
        );
        if (!res.ok) return;
        const { content } = (await res.json()) as { content: string };
        if (!cancelled) setFileSubmissionsContent(content || undefined);
      } catch {
        /* non-critical -- prompts just won't include file content */
      }
    }

    fetchContent();
    return () => {
      cancelled = true;
    };
  }, [fileUploadRequired, submissionId]);

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

      {/* Additional context is not shown as a separate student block; it is passed to AI prompts */}

      {/* File Upload Step (step 0) or Question Assessment */}
      {isOnFileUploadStep ? (
        <div className="space-y-2 w-full">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Upload Files</p>
          </div>
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="text-lg">Upload Required Files</CardTitle>
            </CardHeader>
            <CardContent>
              {assignmentData.file_submission_config && (
                <FileUploadZone
                  submissionId={submissionId}
                  assignmentId={assignmentData.assignment_id}
                  config={assignmentData.file_submission_config}
                  existingFiles={uploadedFiles}
                  onFilesChanged={(files) => onUploadedFilesChanged?.(files)}
                />
              )}
            </CardContent>
          </Card>
          <AssessmentNavigation
            isFirstQuestion={true}
            isLastQuestion={sortedQuestions.length === 0}
            onNext={() => {
              if (uploadedFiles.length === 0) {
                showWarningToast("Please upload the required files to continue.");
                return;
              }
              handleNext();
            }}
          />
        </div>
      ) : currentQuestion ? (
        <AssessmentShell
          key={currentQuestion.order}
          assessmentMode={assessmentMode}
          question={currentQuestion}
          language={preferredLanguage}
          assignmentId={assignmentData.assignment_id}
          submissionId={submissionId}
          questionNumber={questionIndex + 1}
          totalQuestions={sortedQuestions.length}
          onAnswerSave={handleAnswerSave}
          onPrevious={handlePrevious}
          onNext={handleNext}
          isFirstQuestion={currentStepIndex === 0}
          isLastQuestion={isLastQuestion}
          existingAnswer={answers[currentQuestion.order]}
          onLanguageChange={languageChangeHandler}
          maxAttempts={assignmentData.max_attempts ?? 1}
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
          fileSubmissionsContent={fileSubmissionsContent}
          activityType={assignmentData.activity_type ?? "learning"}
        />
      ) : null}
    </div>
    </>
  );
}
