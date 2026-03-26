"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
} from "react";
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
  getSubmissionForSessionRestore,
  getTranscriptsForSubmission,
} from "@/lib/queries/submissions";
import { Assignment } from "@/types/assignment";
import { SubmissionFile } from "@/types/submission";
import { supportedLanguages } from "@/utils/supportedLanguages";
import AssignmentResponseCore from "@/components/Shared/AssignmentResponseCore";
import FileUploadZone from "@/components/Shared/FileUploadZone";
import ResponderDetailsForm from "./ResponderDetailsForm";
import { getSubmissionFiles } from "@/lib/queries/submissionFiles";
import {
  saveSession,
  loadSession,
  clearSession,
  getSubmissionIdFromUrl,
  updateUrlWithSubmissionId,
  removeSubmissionIdFromUrl,
} from "@/utils/sessionStorage";
import { ActivityTrackingProvider } from "@/contexts/ActivityTrackingContext";
import { showErrorToast } from "@/lib/toast";
import { Submission } from "@/types/submission";
import { IntegrityAccessRevokedScreen } from "@/components/Shared/Integrity/IntegrityAccessRevokedScreen";

type Phase = "info" | "file_upload" | "answering" | "completed";

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
  const [integrityRevoked, setIntegrityRevoked] = useState<{
    at: string;
    reason: string | null;
  } | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<SubmissionFile[]>([]);
  const isRestoringRef = useRef(false);

  const fileUploadRequired = !!assignmentData.file_submission_config?.required;

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
    if (assignmentData && restoringSession && !isRestoringRef.current) {
      isRestoringRef.current = true;
      restoreSession().finally(() => {
        isRestoringRef.current = false;
      });
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

      const submission = await getSubmissionForSessionRestore(sessionSubmissionId);

      if (!submission || submission.assignment_id !== assignmentId) {
        console.warn("Invalid submission ID, clearing session");
        clearSession(assignmentId);
        setRestoringSession(false);
        return;
      }

      if (submission.status === "completed") {
        setSubmissionId(submission.submission_id);
        applyIntegrityFromSubmission(submission);
        const name = getDisplayName(submission);
        setDisplayName(name);
        if (onDisplayNameChange) {
          onDisplayNameChange(name);
        }
        setPhase("completed");
        setRestoringSession(false);
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

      // Check if file upload is required and files are missing
      let nextPhase: Phase = "answering";
      if (fileUploadRequired) {
        const files = await getSubmissionFiles(submission.submission_id);
        const completed = files.filter((f) => f.processing_status !== "uploading");
        if (completed.length > 0) {
          setUploadedFiles(completed);
        } else {
          nextPhase = "file_upload";
        }
      }
      setPhase(nextPhase);

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
        phase: nextPhase === "file_upload" ? "answering" : "answering",
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
  }): string => {
    if (submission.responder_details?.name) {
      return submission.responder_details.name;
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
      applyIntegrityFromSubmission(submission);
      const name = getDisplayName(submission);
      setDisplayName(name);
      setPhase(fileUploadRequired ? "file_upload" : "answering");

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
    setIntegrityRevoked(null);

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

  const handleIntegrityAccessRevoked = async () => {
    if (!submissionId) return;
    const s = await getSubmissionById(submissionId);
    if (s) applyIntegrityFromSubmission(s);
  };

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
      <div className="flex items-center justify-center min-h-[60vh]">
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

  // Phase 1.5: File Upload (when required)
  if (phase === "file_upload" && submissionId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-center text-2xl">
              {assignmentData.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <h2 className="text-lg font-semibold">Upload Required Files</h2>
            <FileUploadZone
              submissionId={submissionId}
              assignmentId={assignmentData.assignment_id}
              config={assignmentData.file_submission_config!}
              existingFiles={uploadedFiles}
              onFilesChanged={setUploadedFiles}
            />
            {uploadedFiles.length > 0 && (
              <button
                onClick={() => setPhase("answering")}
                className="w-full inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Continue to Questions
              </button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Phase 2: Question Answering (delegated to core component)
  if (phase === "answering" && submissionId) {
    if (integrityRevoked) {
      return (
        <>
          <div className="w-full space-y-6 px-4">
            <h1 className="text-3xl font-bold">{assignmentData.title}</h1>
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
            onIntegrityAccessRevoked={handleIntegrityAccessRevoked}
          />
        </ActivityTrackingProvider>
      </>
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
          integrityAccessRevoked={!!integrityRevoked}
        />
      </ActivityTrackingProvider>
    );
  }

  return null;
});

export default PublicAssignmentResponse;
