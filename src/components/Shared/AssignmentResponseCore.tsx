"use client";

import { useState, useEffect, useCallback } from "react";
import { Assignment } from "@/types/assignment";
import { VoiceAssessment } from "@/components/VoiceAssessment";
import { ChatAssessment } from "@/components/ChatAssessment";
import { StaticTextAssessment } from "@/components/StaticTextAssessment";
import { updateQuestionIndex } from "@/utils/sessionStorage";
import { useActivityTracking } from "@/hooks/useActivityTracking";
import { getQuestionAttempts } from "@/lib/queries/submissions";
import { isContentComplete } from "@/lib/queries/contentCompletions";

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
  onLanguageChange,
  assignmentId,
  initialQuestionIndex = 0,
  existingAnswers = {},
  currentAttemptNumber,
  maxAttempts,
  maxAttemptsReached,
}: AssignmentResponseCoreProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] =
    useState(initialQuestionIndex);
  const [answers, setAnswers] = useState<{ [key: number]: string }>(
    existingAnswers
  );
  const [isComplete, setIsComplete] = useState(false);
  // Use assignment's preferred_language as fallback if initialPreferredLanguage is empty
  const [preferredLanguage, setPreferredLanguage] = useState(
    initialPreferredLanguage || assignmentData.preferred_language || "en"
  );

  // Track which questions have at least one attempt
  const [questionsWithAttempts, setQuestionsWithAttempts] = useState<
    Set<number>
  >(new Set());

  // Sorted questions for reference
  const sortedQuestions = [...assignmentData.questions].sort(
    (a, b) => a.order - b.order
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
          true // Exclude stale attempts
        );
        if (attempts.length > 0) {
          withAttempts.add(question.order);
        }
      } catch (error) {
        console.error(
          `Error checking attempts for question ${question.order}:`,
          error
        );
      }
    }
    setQuestionsWithAttempts(withAttempts);
  }, [submissionId, sortedQuestions]);

  // Check attempts when component mounts and when navigating between questions
  useEffect(() => {
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

  // If language is locked, don't allow students to change it
  const languageChangeHandler = assignmentData.lock_language
    ? undefined
    : handleLanguageChange;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Assignment Title and Language Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">{assignmentData.title}</h1>
          {isComplete && (
            <span className="text-xs rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-green-600 dark:text-green-400">
              Completed
            </span>
          )}
        </div>
      </div>

      {/* Assessment Component based on mode */}
      {assessmentMode === "voice" && (
        <VoiceAssessment
          key={currentQuestion.order}
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
          studentInstructions={assignmentData.student_instructions}
          showRubric={assignmentData.show_rubric ?? true}
          showRubricPoints={assignmentData.show_rubric_points ?? true}
          useStarDisplay={assignmentData.use_star_display ?? false}
          starScale={assignmentData.star_scale ?? 5}
          requireAllAttempts={assignmentData.require_all_attempts ?? false}
          allQuestionsHaveAttempts={allQuestionsHaveAttempts}
          questionsWithAttempts={questionsWithAttempts}
          onAttemptCreated={handleAttemptCreated}
          onMarkedComplete={() => setIsComplete(true)}
          isComplete={isComplete}
        />
      )}
      {assessmentMode === "text_chat" && (
        <ChatAssessment
          key={currentQuestion.order}
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
          studentInstructions={assignmentData.student_instructions}
          showRubric={assignmentData.show_rubric ?? true}
          showRubricPoints={assignmentData.show_rubric_points ?? true}
          requireAllAttempts={assignmentData.require_all_attempts ?? false}
          allQuestionsHaveAttempts={allQuestionsHaveAttempts}
          questionsWithAttempts={questionsWithAttempts}
          onAttemptCreated={handleAttemptCreated}
          onMarkedComplete={() => setIsComplete(true)}
          isComplete={isComplete}
        />
      )}
      {assessmentMode === "static_text" && (
        <StaticTextAssessment
          key={currentQuestion.order}
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
          contentItemId={contentItemId}
          studentInstructions={assignmentData.student_instructions}
          showRubric={assignmentData.show_rubric ?? true}
          showRubricPoints={assignmentData.show_rubric_points ?? true}
          useStarDisplay={assignmentData.use_star_display ?? false}
          starScale={assignmentData.star_scale ?? 5}
          requireAllAttempts={assignmentData.require_all_attempts ?? false}
          allQuestionsHaveAttempts={allQuestionsHaveAttempts}
          questionsWithAttempts={questionsWithAttempts}
          onAttemptCreated={handleAttemptCreated}
          onMarkedComplete={() => setIsComplete(true)}
          isComplete={isComplete}
        />
      )}
    </div>
  );
}
