"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSubmission,
  getSubmissionById,
  getSubmissionForSessionRestore,
  getSubmissionByStudentAndAssignment,
  getTranscriptsForSubmission,
} from "@/lib/queries/submissions";
import { Assignment } from "@/types/assignment";
import { Submission, SubmissionFile } from "@/types/submission";
import AssignmentResponseCore from "@/components/Shared/AssignmentResponseCore";
import { IntegrityAccessRevokedScreen } from "@/components/Shared/Integrity/IntegrityAccessRevokedScreen";
import { getSubmissionFiles } from "@/lib/queries/submissionFiles";
import {
  saveSession,
  loadSession,
  getSubmissionIdFromUrl,
  updateUrlWithSubmissionId,
} from "@/utils/sessionStorage";
import { useAuth } from "@/contexts/AuthContext";
import { ActivityTrackingProvider } from "@/contexts/ActivityTrackingContext";
import { showErrorToast } from "@/lib/toast";

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
    assignmentData.preferred_language || "en"
  );
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [existingAnswers, setExistingAnswers] = useState<{
    [key: number]: string;
  }>({});
  const [integrityRevoked, setIntegrityRevoked] = useState<{
    at: string;
    reason: string | null;
  } | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<SubmissionFile[]>([]);
  const [generatedQuestions, setGeneratedQuestions] = useState<
    import("@/types/assignment").Question[] | null
  >(null);
  const [generatedFromFileIds, setGeneratedFromFileIds] = useState<
    string[] | null
  >(null);
  const isInitializingRef = useRef(false);

  const fileUploadRequired = !!assignmentData.file_submission_config?.required;
  const dynamicQuestionsEnabled =
    !!assignmentData.dynamic_questions_enabled && fileUploadRequired;

  const applyIntegrityFromSubmission = useCallback(
    (s: Pick<Submission, "integrity_access_revoked_at" | "integrity_access_revoked_reason">) => {
      if (s.integrity_access_revoked_at) {
        setIntegrityRevoked({
          at: s.integrity_access_revoked_at,
          reason: s.integrity_access_revoked_reason ?? null,
        });
      } else {
        setIntegrityRevoked(null);
      }
    },
    [],
  );

  // Restore session or create new submission
  useEffect(() => {
    if (assignmentData && user && restoringSession && !isInitializingRef.current) {
      isInitializingRef.current = true;
      restoreOrCreateSubmission().finally(() => {
        isInitializingRef.current = false;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentData, user, restoringSession]);

  useEffect(() => {
    if (!submissionId || !fileUploadRequired) return;
    getSubmissionFiles(submissionId).then((files) => {
      const completed = files.filter((f) => f.processing_status !== "uploading");
      setUploadedFiles(completed);
    });
  }, [submissionId, fileUploadRequired]);

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
        const submission = await getSubmissionForSessionRestore(sessionSubmissionId);

        if (
          !submission ||
          submission.assignment_id !== assignmentData.assignment_id
        ) {
          if (!existingSubmission) {
            await createNewSubmission();
          }
          return;
        }

        setSubmissionId(submission.submission_id);
        applyIntegrityFromSubmission(submission);
        const name = getDisplayName(submission);
        setDisplayName(name);
        setPreferredLanguage(submission.preferred_language);
        if (onDisplayNameChange) {
          onDisplayNameChange(name);
        }

        // Restore generated questions if available
        if (submission.generated_questions) {
          setGeneratedQuestions(submission.generated_questions);
          setGeneratedFromFileIds(submission.generated_from_file_ids ?? null);
        }

        // Reconstruct answers from transcripts table
        const reconstructedAnswers: { [key: number]: string } = {};
        const transcripts = await getTranscriptsForSubmission(submission.submission_id);

        for (const t of transcripts) {
          if (!reconstructedAnswers[t.question_order] || t.attempt_number > 0) {
            reconstructedAnswers[t.question_order] = t.answer_text;
          }
        }
        setExistingAnswers(reconstructedAnswers);

        let questionIndex = localSession?.currentQuestionIndex ?? 0;

        // For dynamic questions, use generated questions length or fallback to assignment questions
        const effectiveQuestionCount = dynamicQuestionsEnabled && submission.generated_questions
          ? submission.generated_questions.length
          : assignmentData.questions.length;
        const maxValidIndex =
          effectiveQuestionCount + (fileUploadRequired ? 1 : 0) - 1;
        if (
          !assignmentData?.questions ||
          questionIndex > maxValidIndex
        ) {
          questionIndex = 0;
        }

        setCurrentQuestionIndex(questionIndex);

        if (!urlSubmissionId) {
          updateUrlWithSubmissionId(assignmentId, submission.submission_id);
        }

        saveSession(assignmentId, {
          submissionId: submission.submission_id,
          studentName: name,
          preferredLanguage: submission.preferred_language,
          currentQuestionIndex: questionIndex,
          phase: "answering",
        });
      } else {
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
      const submission = await getSubmissionForSessionRestore(existing.submission_id);
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
      applyIntegrityFromSubmission(submission);
      const name = getDisplayName(submission);
      setDisplayName(name);

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
      showErrorToast("Failed to start assignment. Please try again.");
    }
  };

  const restoreSubmission = async (submission: {
    submission_id: string;
    preferred_language: string;
    responder_details?: Record<string, string>;
    integrity_access_revoked_at?: string | null;
    integrity_access_revoked_reason?: string | null;
  }) => {
    setSubmissionId(submission.submission_id);
    applyIntegrityFromSubmission(submission);
    const name = getDisplayName(submission);
    setDisplayName(name);
    setPreferredLanguage(submission.preferred_language);
    if (onDisplayNameChange) {
      onDisplayNameChange(name);
    }

    // Reconstruct answers from transcripts table
    const reconstructedAnswers: { [key: number]: string } = {};
    const transcripts = await getTranscriptsForSubmission(submission.submission_id);

    // Build a map of question_order -> latest transcript text
    for (const t of transcripts) {
      if (!reconstructedAnswers[t.question_order] || t.attempt_number > 0) {
        reconstructedAnswers[t.question_order] = t.answer_text;
      }
    }
    setExistingAnswers(reconstructedAnswers);

    const localSession = loadSession(assignmentId);
    let questionIndex = localSession?.currentQuestionIndex ?? 0;

    const maxValidIndex =
      assignmentData.questions.length + (fileUploadRequired ? 1 : 0) - 1;
    if (
      !assignmentData?.questions ||
      questionIndex > maxValidIndex
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

  const getDisplayName = (submission: {
    responder_details?: Record<string, string>;
  }): string => {
    if (submission.responder_details?.name) {
      return submission.responder_details.name;
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
      <div className="w-full space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">{assignmentData.title}</h1>
        </div>
        <div className="flex items-center justify-center min-h-[40vh]">
          <p className="text-muted-foreground">Starting assignment...</p>
        </div>
      </div>
    );
  }

  const handleIntegrityAccessRevoked = async () => {
    const s = await getSubmissionById(submissionId);
    if (s) applyIntegrityFromSubmission(s);
  };

  if (integrityRevoked) {
    return (
      <>
        <div className="w-full space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">{assignmentData.title}</h1>
          </div>
          <IntegrityAccessRevokedScreen
            reasonCode={integrityRevoked.reason}
          />
        </div>
      </>
    );
  }

  return (
    <>
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
            if (onComplete) {
              onComplete();
            }
          }}
          onBack={onBack}
          onLanguageChange={handleLanguageChange}
          assignmentId={assignmentId}
          initialQuestionIndex={currentQuestionIndex}
          existingAnswers={existingAnswers}
          onIntegrityAccessRevoked={handleIntegrityAccessRevoked}
          integrityAccessRevoked={!!integrityRevoked}
          fileUploadRequired={fileUploadRequired}
          uploadedFiles={uploadedFiles}
          onUploadedFilesChanged={setUploadedFiles}
          dynamicQuestionsEnabled={dynamicQuestionsEnabled}
          initialGeneratedQuestions={generatedQuestions}
          generatedFromFileIds={generatedFromFileIds}
        />
      </ActivityTrackingProvider>
    </>
  );
}
