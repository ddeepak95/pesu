"use client";

import { useEffect, useState } from "react";
import {
  createSubmission,
  getSubmissionById,
  getSubmissionByStudentAndAssignment,
  getMaxAttemptCountAcrossQuestions,
} from "@/lib/queries/submissions";
import { Assignment } from "@/types/assignment";
import {
  SubmissionAnswer,
  SubmissionAttempt,
  QuestionAnswers,
} from "@/types/submission";
import AssignmentResponseCore from "@/components/Shared/AssignmentResponseCore";
import {
  saveSession,
  loadSession,
  getSubmissionIdFromUrl,
  updateUrlWithSubmissionId,
} from "@/utils/sessionStorage";
import { useAuth } from "@/contexts/AuthContext";
import { ActivityTrackingProvider } from "@/contexts/ActivityTrackingContext";

// No phase needed - students can always view and attempt questions

interface StudentAssignmentResponseProps {
  assignmentData: Assignment;
  assignmentId: string;
  classId?: string; // Class ID for activity tracking
  contentItemId?: string | null; // For marking as complete
  onComplete?: () => void;
  onBack?: () => void;
  onDisplayNameChange?: (name: string) => void;
}

/**
 * Student assignment response wrapper
 * Handles authenticated student flow with auto-start (no responder details form)
 */
export default function StudentAssignmentResponse({
  assignmentData,
  assignmentId,
  classId,
  contentItemId,
  onComplete,
  onBack,
  onDisplayNameChange,
}: StudentAssignmentResponseProps) {
  const { user } = useAuth();
  const [restoringSession, setRestoringSession] = useState(true);
  const [preferredLanguage, setPreferredLanguage] = useState(
    assignmentData.preferred_language || ""
  );
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [existingAnswers, setExistingAnswers] = useState<{ [key: number]: string }>({});
  const [currentAttemptNumber, setCurrentAttemptNumber] = useState<number>(1);
  const [maxAttemptsReached, setMaxAttemptsReached] = useState<boolean>(false);

  // Restore session or create new submission
  useEffect(() => {
    if (assignmentData && user && restoringSession) {
      restoreOrCreateSubmission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentData, user, restoringSession]);

  const restoreOrCreateSubmission = async () => {
    try {
      if (!user?.id) {
        setRestoringSession(false);
        return;
      }

      // First, check URL for submission ID
      const urlSubmissionId = getSubmissionIdFromUrl();

      // Then check localStorage
      const localSession = loadSession(assignmentId);

      // ALWAYS try to get existing submission by student and assignment first
      const existingSubmission = await getSubmissionByStudentAndAssignment(
        user.id,
        assignmentData.assignment_id
      );

      // Prefer existing submission from database, then URL parameter, then localStorage
      const sessionSubmissionId =
        existingSubmission?.submission_id ||
        urlSubmissionId ||
        localSession?.submissionId;

      if (sessionSubmissionId) {
        // Fetch the submission from database
        const submission = await getSubmissionById(sessionSubmissionId);

        if (!submission || submission.assignment_id !== assignmentData.assignment_id) {
          // Invalid or mismatched submission, only create new if no existing submission found
          if (!existingSubmission) {
            await createNewSubmission();
          }
          return;
        }

        // Get max attempts from assignment (default to 1)
        const maxAttempts = assignmentData.max_attempts ?? 1;
        
        // Get current attempt count
        const attemptCount = await getMaxAttemptCountAcrossQuestions(submission.submission_id);
        const nextAttemptNumber = attemptCount + 1;
        setCurrentAttemptNumber(nextAttemptNumber);

        // Check if max attempts reached
        if (attemptCount >= maxAttempts) {
          setMaxAttemptsReached(true);
        }

        // No need to check completion status - students can always view and continue attempts
        // Continue to restore the submission for answering

        // Restore in-progress submission
        setSubmissionId(submission.submission_id);
        const name = getDisplayName(submission);
        setDisplayName(name);
        setPreferredLanguage(submission.preferred_language);
        if (onDisplayNameChange) {
          onDisplayNameChange(name);
        }

        // Reconstruct answers from submission data
        const reconstructedAnswers: { [key: number]: string } = {};
        const submissionAnswers = submission.answers as
          | SubmissionAnswer[]
          | { [key: number]: QuestionAnswers };

        if (Array.isArray(submissionAnswers)) {
          submissionAnswers.forEach((answer) => {
            reconstructedAnswers[answer.question_order] = answer.answer_text;
          });
        } else if (submissionAnswers && typeof submissionAnswers === "object") {
          Object.entries(submissionAnswers).forEach(
            ([questionOrderKey, questionValue]) => {
              const questionOrder = Number(questionOrderKey);
              if (Number.isNaN(questionOrder)) return;

              const questionAnswers = questionValue as QuestionAnswers;
              if (!questionAnswers.attempts?.length) return;

              // Filter out stale attempts
              const nonStaleAttempts = questionAnswers.attempts.filter(
                (attempt) => !attempt.stale
              );

              if (!nonStaleAttempts.length) return;

              let selectedAttempt: SubmissionAttempt | undefined;

              if (questionAnswers.selected_attempt) {
                // First try to find selected attempt in non-stale attempts
                selectedAttempt = nonStaleAttempts.find(
                  (attempt) =>
                    attempt.attempt_number === questionAnswers.selected_attempt
                );
              }

              if (!selectedAttempt) {
                // Use the latest non-stale attempt
                selectedAttempt = nonStaleAttempts[nonStaleAttempts.length - 1];
              }

              if (selectedAttempt) {
                reconstructedAnswers[questionOrder] =
                  selectedAttempt.answer_text || "";
              }
            }
          );
        }
        setExistingAnswers(reconstructedAnswers);

        // Determine current question index
        let questionIndex = localSession?.currentQuestionIndex ?? 0;

        // Validate the index is within bounds
        if (
          !assignmentData?.questions ||
          questionIndex >= assignmentData.questions.length
        ) {
          questionIndex = 0;
        }

        setCurrentQuestionIndex(questionIndex);

        // Ensure URL has the submission ID
        if (!urlSubmissionId) {
          updateUrlWithSubmissionId(assignmentId, submission.submission_id);
        }

        // Save/update localStorage
        saveSession(assignmentId, {
          submissionId: submission.submission_id,
          studentName: name,
          preferredLanguage: submission.preferred_language,
          currentQuestionIndex: questionIndex,
          phase: "answering",
        });
      } else {
        // No existing submission found, create new one (first attempt)
        setCurrentAttemptNumber(1);
        await createNewSubmission();
      }
    } catch (err) {
      console.error("Error restoring or creating submission:", err);
      await createNewSubmission();
    } finally {
      setRestoringSession(false);
    }
  };

  const createNewSubmission = async () => {
    if (!user?.id || !assignmentData) return;

    // Check if existing submission exists (shouldn't happen, but double-check)
    const existing = await getSubmissionByStudentAndAssignment(
      user.id,
      assignmentData.assignment_id
    );
    
    if (existing) {
      // Reuse existing submission instead of creating new one
      const submission = await getSubmissionById(existing.submission_id);
      if (submission) {
        await restoreSubmission(submission);
        return;
      }
    }

    try {
      const submissionMode = assignmentData.assessment_mode ?? "voice";
      const submission = await createSubmission(
        assignmentData.assignment_id,
        preferredLanguage,
        submissionMode,
        {
          studentId: user.id,
        }
      );
      setSubmissionId(submission.submission_id);
      const name = getDisplayName(submission);
      setDisplayName(name);
      // For new submission, current attempt is 1 (no attempts yet)
      setCurrentAttemptNumber(1);
      setMaxAttemptsReached(false);

      if (onDisplayNameChange) {
        onDisplayNameChange(name);
      }

      // Save session to localStorage
      saveSession(assignmentId, {
        submissionId: submission.submission_id,
        studentName: name,
        preferredLanguage,
        currentQuestionIndex: 0,
        phase: "answering",
      });

      // Update URL with submission ID
      updateUrlWithSubmissionId(assignmentId, submission.submission_id);
    } catch (err) {
      console.error("Error creating submission:", err);
      alert("Failed to start assignment. Please try again.");
    }
  };

  const restoreSubmission = async (submission: { submission_id: string; preferred_language: string; responder_details?: Record<string, string>; student_name?: string; answers?: { [key: number]: QuestionAnswers } | SubmissionAnswer[] }) => {
    setSubmissionId(submission.submission_id);
    const name = getDisplayName(submission);
    setDisplayName(name);
    setPreferredLanguage(submission.preferred_language);
    if (onDisplayNameChange) {
      onDisplayNameChange(name);
    }

    // Get attempt count (for display purposes, but actual attempt number is per question)
    const attemptCount = await getMaxAttemptCountAcrossQuestions(submission.submission_id);
    // Set to 1 if no attempts yet, otherwise attemptCount + 1 for next attempt
    setCurrentAttemptNumber(attemptCount === 0 ? 1 : attemptCount + 1);

    // Reconstruct answers from submission data
    const reconstructedAnswers: { [key: number]: string } = {};
    const submissionAnswers = submission.answers as
      | SubmissionAnswer[]
      | { [key: number]: QuestionAnswers };

    if (Array.isArray(submissionAnswers)) {
      submissionAnswers.forEach((answer) => {
        reconstructedAnswers[answer.question_order] = answer.answer_text;
      });
    } else if (submissionAnswers && typeof submissionAnswers === "object") {
      Object.entries(submissionAnswers).forEach(
        ([questionOrderKey, questionValue]) => {
          const questionOrder = Number(questionOrderKey);
          if (Number.isNaN(questionOrder)) return;

          const questionAnswers = questionValue as QuestionAnswers;
          if (!questionAnswers.attempts?.length) return;

          // Filter out stale attempts
          const nonStaleAttempts = questionAnswers.attempts.filter(
            (attempt) => !attempt.stale
          );

          if (!nonStaleAttempts.length) return;

          let selectedAttempt: SubmissionAttempt | undefined;

          if (questionAnswers.selected_attempt) {
            // First try to find selected attempt in non-stale attempts
            selectedAttempt = nonStaleAttempts.find(
              (attempt) =>
                attempt.attempt_number === questionAnswers.selected_attempt
            );
          }

          if (!selectedAttempt) {
            // Use the latest non-stale attempt
            selectedAttempt = nonStaleAttempts[nonStaleAttempts.length - 1];
          }

          if (selectedAttempt) {
            reconstructedAnswers[questionOrder] =
              selectedAttempt.answer_text || "";
          }
        }
      );
    }
    setExistingAnswers(reconstructedAnswers);

    // Determine current question index
    const localSession = loadSession(assignmentId);
    let questionIndex = localSession?.currentQuestionIndex ?? 0;

    // Validate the index is within bounds
    if (
      !assignmentData?.questions ||
      questionIndex >= assignmentData.questions.length
    ) {
      questionIndex = 0;
    }

        setCurrentQuestionIndex(questionIndex);

    // Ensure URL has the submission ID
    updateUrlWithSubmissionId(assignmentId, submission.submission_id);

    // Save/update localStorage
    saveSession(assignmentId, {
      submissionId: submission.submission_id,
      studentName: name,
      preferredLanguage: submission.preferred_language,
      currentQuestionIndex: questionIndex,
      phase: "answering",
    });
  };

  const getDisplayName = (submission: { responder_details?: Record<string, string>; student_name?: string }): string => {
    if (submission.responder_details?.name) {
      return submission.responder_details.name;
    }
    if (submission.student_name) {
      return submission.student_name;
    }
    // Fallback to user metadata
    return (
      user?.user_metadata?.display_name ||
      user?.user_metadata?.name ||
      user?.email?.split("@")[0] ||
      "Student"
    );
  };

  const handleLanguageChange = (newLanguage: string) => {
    setPreferredLanguage(newLanguage);

    // Update language in localStorage session
    const session = loadSession(assignmentId);
    if (session) {
      saveSession(assignmentId, {
        ...session,
        preferredLanguage: newLanguage,
      });
    }
  };

  if (restoringSession || !submissionId) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">{assignmentData.title}</h1>
        </div>
        <div className="flex items-center justify-center min-h-[40vh]">
          <p className="text-muted-foreground">Starting assignment...</p>
        </div>
      </div>
    );
  }

  const maxAttempts = assignmentData.max_attempts ?? 1;

  // Phase: Question Answering or Completion (delegated to core component)
  // Wrap with ActivityTrackingProvider to provide context for activity tracking
  return (
    <ActivityTrackingProvider
      userId={user?.id}
      classId={classId}
      submissionId={submissionId}
    >
      <AssignmentResponseCore
        assignmentData={assignmentData}
        submissionId={submissionId}
        displayName={displayName}
        preferredLanguage={preferredLanguage}
        contentItemId={contentItemId}
        onComplete={() => {
          // Attempts are automatically saved, no explicit completion needed
          if (onComplete) {
            onComplete();
          }
        }}
        onBack={onBack}
        onLanguageChange={handleLanguageChange}
        assignmentId={assignmentId}
        initialQuestionIndex={currentQuestionIndex}
        existingAnswers={existingAnswers}
        currentAttemptNumber={currentAttemptNumber}
        maxAttempts={maxAttempts}
        maxAttemptsReached={maxAttemptsReached}
      />
    </ActivityTrackingProvider>
  );
}

