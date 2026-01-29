"use client";

import { useState } from "react";
import { Assignment } from "@/types/assignment";
import { VoiceAssessment } from "@/components/VoiceAssessment";
import { ChatAssessment } from "@/components/ChatAssessment";
import { StaticTextAssessment } from "@/components/StaticTextAssessment";
import {
  updateQuestionIndex,
} from "@/utils/sessionStorage";
import { useActivityTracking } from "@/hooks/useActivityTracking";

interface AssignmentResponseCoreProps {
  assignmentData: Assignment;
  submissionId: string; // Required - must be provided by wrapper
  displayName: string; // For display in header - derived from responder_details or user
  preferredLanguage: string;
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
  onComplete,
  onLanguageChange,
  assignmentId,
  initialQuestionIndex = 0,
  existingAnswers = {},
  currentAttemptNumber,
  maxAttempts,
  maxAttemptsReached,
}: AssignmentResponseCoreProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(initialQuestionIndex);
  const [answers, setAnswers] = useState<{ [key: number]: string }>(existingAnswers);
  const [preferredLanguage, setPreferredLanguage] = useState(initialPreferredLanguage);

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
  const sortedQuestions = [...assignmentData.questions].sort(
    (a, b) => a.order - b.order
  );
  const currentQuestion = sortedQuestions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === sortedQuestions.length - 1;

  const assessmentMode = assignmentData.assessment_mode ?? "voice";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Assignment Title and Language Selector */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{assignmentData.title}</h1>
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
          onLanguageChange={handleLanguageChange}
          currentAttemptNumber={currentAttemptNumber}
          maxAttempts={maxAttempts}
          maxAttemptsReached={maxAttemptsReached}
          botPromptConfig={assignmentData.bot_prompt_config}
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
          onLanguageChange={handleLanguageChange}
          currentAttemptNumber={currentAttemptNumber}
          maxAttempts={maxAttempts}
          maxAttemptsReached={maxAttemptsReached}
          botPromptConfig={assignmentData.bot_prompt_config}
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
          onLanguageChange={handleLanguageChange}
          currentAttemptNumber={currentAttemptNumber}
          maxAttempts={maxAttempts}
          maxAttemptsReached={maxAttemptsReached}
        />
      )}
    </div>
  );
}

