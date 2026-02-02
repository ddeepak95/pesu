"use client";

import { useEffect, useState, useImperativeHandle, forwardRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createSubmission,
  getSubmissionById,
  getMaxAttemptCountAcrossQuestions,
} from "@/lib/queries/submissions";
import { Assignment } from "@/types/assignment";
import {
  SubmissionAnswer,
  SubmissionAttempt,
  QuestionAnswers,
} from "@/types/submission";
import { supportedLanguages } from "@/utils/supportedLanguages";
import AssignmentResponseCore from "@/components/Shared/AssignmentResponseCore";
import ResponderDetailsForm from "./ResponderDetailsForm";
import {
  saveSession,
  loadSession,
  clearSession,
  getSubmissionIdFromUrl,
  updateUrlWithSubmissionId,
  removeSubmissionIdFromUrl,
} from "@/utils/sessionStorage";
import { ActivityTrackingProvider } from "@/contexts/ActivityTrackingContext";

type Phase = "info" | "answering" | "completed";

interface PublicAssignmentResponseProps {
  assignmentData: Assignment;
  assignmentId: string;
  onComplete?: () => void;
  onBack?: () => void;
  onDisplayNameChange?: (name: string) => void;
  onSubmissionStateChange?: (hasActiveSubmission: boolean) => void;
}

export interface PublicAssignmentResponseRef {
  resetSubmission: () => void;
}

/**
 * Public assignment response wrapper
 * Handles responder details collection and session management for public assignments
 */
const PublicAssignmentResponse = forwardRef<
  PublicAssignmentResponseRef,
  PublicAssignmentResponseProps
>(function PublicAssignmentResponse(
  {
    assignmentData,
    assignmentId,
    onComplete,
    onBack,
    onDisplayNameChange,
    onSubmissionStateChange,
  },
  ref
) {
  const [phase, setPhase] = useState<Phase>("info");
  const [restoringSession, setRestoringSession] = useState(true);
  const [preferredLanguage, setPreferredLanguage] = useState(
    assignmentData.preferred_language || "en"
  );
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [existingAnswers, setExistingAnswers] = useState<{
    [key: number]: string;
  }>({});
  const [maxAttemptsReached, setMaxAttemptsReached] = useState<boolean>(false);

  // Get max attempts from assignment config
  const maxAttempts = assignmentData.max_attempts ?? 1;

  // Get responder fields config or default to name field
  const responderFields = assignmentData.responder_fields_config || [
    {
      field: "name",
      type: "text" as const,
      label: "Your Name",
      required: true,
      placeholder: "Enter your name",
    },
  ];

  // Notify parent of submission state changes
  useEffect(() => {
    if (onSubmissionStateChange) {
      onSubmissionStateChange(submissionId !== null && phase !== "info");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, phase]);

  // Restore session after assignment is loaded
  useEffect(() => {
    if (assignmentData && restoringSession) {
      restoreSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentData, restoringSession]);

  const restoreSession = async () => {
    try {
      // First, check URL for submission ID
      const urlSubmissionId = getSubmissionIdFromUrl();

      // Then check localStorage
      const localSession = loadSession(assignmentId);

      // Prefer URL parameter over localStorage
      const sessionSubmissionId = urlSubmissionId || localSession?.submissionId;

      if (!sessionSubmissionId) {
        // No session to restore
        setRestoringSession(false);
        return;
      }

      // Fetch the submission from database
      const submission = await getSubmissionById(sessionSubmissionId);

      if (!submission || submission.assignment_id !== assignmentId) {
        // Invalid or mismatched submission
        console.warn("Invalid submission ID, clearing session");
        clearSession(assignmentId);
        setRestoringSession(false);
        return;
      }

      if (submission.status === "completed") {
        // Submission is completed, show completion screen
        setSubmissionId(submission.submission_id);
        const name = getDisplayName(submission);
        setDisplayName(name);
        if (onDisplayNameChange) {
          onDisplayNameChange(name);
        }
        setPhase("completed");
        setRestoringSession(false);
        return;
      }

      // Restore in-progress submission
      setSubmissionId(submission.submission_id);
      const name = getDisplayName(submission);
      setDisplayName(name);
      setPreferredLanguage(submission.preferred_language);
      if (onDisplayNameChange) {
        onDisplayNameChange(name);
      }

      // Check if max attempts reached
      const attemptCount = await getMaxAttemptCountAcrossQuestions(
        submission.submission_id
      );
      if (attemptCount >= maxAttempts) {
        setMaxAttemptsReached(true);
      }

      // Reconstruct answers from submission data (supports both formats)
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

            let selectedAttempt: SubmissionAttempt | undefined;

            if (questionAnswers.selected_attempt) {
              selectedAttempt = questionAnswers.attempts.find(
                (attempt) =>
                  attempt.attempt_number === questionAnswers.selected_attempt
              );
            }

            if (!selectedAttempt) {
              selectedAttempt =
                questionAnswers.attempts[questionAnswers.attempts.length - 1];
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
      setPhase("answering");

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
    } catch (err) {
      console.error("Error restoring session:", err);
      clearSession(assignmentId);
    } finally {
      setRestoringSession(false);
    }
  };

  const getDisplayName = (submission: {
    responder_details?: Record<string, string>;
    student_name?: string;
  }): string => {
    if (submission.responder_details?.name) {
      return submission.responder_details.name;
    }
    if (submission.student_name) {
      return submission.student_name;
    }
    return "Responder";
  };

  const handleBeginAssignment = async (
    responderDetails: Record<string, string>
  ) => {
    if (!assignmentData) return;

    try {
      const submissionMode = assignmentData.assessment_mode ?? "voice";
      const submission = await createSubmission(
        assignmentData.assignment_id,
        preferredLanguage,
        submissionMode,
        {
          responderDetails,
        }
      );
      setSubmissionId(submission.submission_id);
      const name = getDisplayName(submission);
      setDisplayName(name);
      setPhase("answering");

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

  const resetSubmission = () => {
    // Clear localStorage session
    clearSession(assignmentId);

    // Remove submission ID from URL
    removeSubmissionIdFromUrl();

    // Reset component state
    setSubmissionId(null);
    setDisplayName("");
    setCurrentQuestionIndex(0);
    setExistingAnswers({});
    setPhase("info");
    setPreferredLanguage(assignmentData.preferred_language || "en");
    setMaxAttemptsReached(false);

    // Clear display name in parent
    if (onDisplayNameChange) {
      onDisplayNameChange("");
    }

    // Notify parent that submission is cleared
    if (onSubmissionStateChange) {
      onSubmissionStateChange(false);
    }
  };

  // Expose reset function via ref
  useImperativeHandle(ref, () => ({
    resetSubmission,
  }));

  if (restoringSession) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Restoring your session...</p>
      </div>
    );
  }

  // Phase 1: Responder Details Form
  if (phase === "info") {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-2xl">
              {assignmentData.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Only show language selector if language is not locked */}
            {!assignmentData.lock_language && (
              <div className="space-y-2">
                <label htmlFor="language" className="text-sm font-medium">
                  Preferred Language
                </label>
                <Select
                  value={preferredLanguage}
                  onValueChange={setPreferredLanguage}
                >
                  <SelectTrigger id="language">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {supportedLanguages.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <ResponderDetailsForm
              fields={responderFields}
              onSubmit={handleBeginAssignment}
              submitLabel="Begin Assignment"
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Phase 2: Question Answering (delegated to core component)
  // Wrap with ActivityTrackingProvider - userId is undefined for public submissions
  if (phase === "answering" && submissionId) {
    return (
      <ActivityTrackingProvider
        submissionId={submissionId}
        classId={assignmentData.class_id}
      >
        <AssignmentResponseCore
          assignmentData={assignmentData}
          submissionId={submissionId}
          displayName={displayName}
          preferredLanguage={preferredLanguage}
          onComplete={() => {
            setPhase("completed");
            clearSession(assignmentId);
            if (onComplete) {
              onComplete();
            }
          }}
          onBack={onBack}
          onLanguageChange={handleLanguageChange}
          assignmentId={assignmentId}
          initialQuestionIndex={currentQuestionIndex}
          existingAnswers={existingAnswers}
          maxAttempts={maxAttempts}
          maxAttemptsReached={maxAttemptsReached}
        />
      </ActivityTrackingProvider>
    );
  }

  // Phase 3: Completion (delegated to core component)
  if (phase === "completed" && submissionId) {
    return (
      <ActivityTrackingProvider
        submissionId={submissionId}
        classId={assignmentData.class_id}
      >
        <AssignmentResponseCore
          assignmentData={assignmentData}
          submissionId={submissionId}
          displayName={displayName}
          preferredLanguage={preferredLanguage}
          onComplete={onComplete}
          onBack={onBack}
          assignmentId={assignmentId}
          initialQuestionIndex={0}
          existingAnswers={{}}
          maxAttempts={maxAttempts}
          maxAttemptsReached={maxAttemptsReached}
        />
      </ActivityTrackingProvider>
    );
  }

  return null;
});

export default PublicAssignmentResponse;
