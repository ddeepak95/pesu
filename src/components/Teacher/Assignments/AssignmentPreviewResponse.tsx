"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  createSubmission,
  resetPreviewSubmission,
} from "@/lib/queries/submissions";
import {
  fetchPreviewSubmissionTracked,
  fetchSubmissionFilesTracked,
  fetchTranscriptsForSubmissionTracked,
} from "@/lib/swr/imperativeReads";
import {
  invalidateQuestionAttemptsNormalizedCache,
  invalidateQuestionsWithAttemptsCache,
  invalidateSubmissionByIdCache,
} from "@/hooks/swr";
import { Assignment, Question } from "@/types/assignment";
import { SubmissionFile } from "@/types/submission";
import AssignmentResponseCore from "@/components/Shared/AssignmentResponseCore";
import { ActivityTrackingProvider } from "@/contexts/ActivityTrackingContext";
import { Button } from "@/components/ui/button";
import { showErrorToast } from "@/lib/toast";
import { Eye, Loader2, RotateCcw, X } from "lucide-react";

interface AssignmentPreviewResponseProps {
  /** The saved assignment row to preview (real row, resolved server-side by id). */
  assignment: Assignment;
  /** The previewing teacher's user id (carried on the preview submission). */
  teacherId: string;
  /** Class short id, for activity tracking only (optional). */
  classId?: string;
  /** Close the preview overlay and return to the builder. */
  onExit: () => void;
}

/**
 * Teacher "Save and Preview" wrapper — a third sibling of StudentAssignmentResponse
 * / PublicAssignmentResponse. Resolves (or creates) a single flagged preview
 * submission against the real saved assignment row and renders the shared
 * AssignmentResponseCore in `previewMode`. Preview data is written to the DB but is
 * filtered out of every submission read surface (see queries/submissions.ts).
 *
 * Differences from the student flow:
 *  - `previewMode` → integrity tracking off, copy/paste on, no max-attempts cap.
 *  - `contentItemId={null}` and `forceComplete={false}` → completion is never marked.
 *  - No URL / localStorage session plumbing (this is a transient overlay).
 */
export default function AssignmentPreviewResponse({
  assignment,
  teacherId,
  classId,
  onExit,
}: AssignmentPreviewResponseProps) {
  const [loading, setLoading] = useState(true);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [existingAnswers, setExistingAnswers] = useState<{
    [key: string]: string;
  }>({});
  const [uploadedFiles, setUploadedFiles] = useState<SubmissionFile[]>([]);
  const [generatedQuestions, setGeneratedQuestions] = useState<
    Question[] | null
  >(null);
  const [generatedFromFileIds, setGeneratedFromFileIds] = useState<
    string[] | null
  >(null);
  /** Bumped on "Restart preview" to remount the core and clear its internal state. */
  const [previewEpoch, setPreviewEpoch] = useState(0);
  const [restarting, setRestarting] = useState(false);
  const initializingRef = useRef(false);

  // Portal target only exists on the client; gate render until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Lock background page scroll while the full-screen preview is mounted, so the
  // overlay doesn't inherit / pass through the builder page's scroll.
  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  const fileUploadRequired = !!assignment.file_submission_config?.required;
  const dynamicQuestionsEnabled =
    !!assignment.dynamic_questions_enabled && fileUploadRequired;

  const hydrateFromSubmission = useCallback(
    async (sid: string) => {
      // Reconstruct prior answers from transcripts so re-opening preview resumes.
      const transcripts = await fetchTranscriptsForSubmissionTracked(sid);
      const answers: { [key: string]: string } = {};
      for (const t of transcripts) {
        if (!answers[t.question_id] || t.attempt_number > 0) {
          answers[t.question_id] = t.answer_text;
        }
      }
      setExistingAnswers(answers);

      if (fileUploadRequired) {
        const files = await fetchSubmissionFilesTracked(sid);
        setUploadedFiles(files);
      }
    },
    [fileUploadRequired],
  );

  // Resolve or create the preview submission on mount.
  useEffect(() => {
    if (initializingRef.current) return;
    initializingRef.current = true;

    (async () => {
      try {
        const existing = await fetchPreviewSubmissionTracked(
          teacherId,
          assignment.assignment_id,
        );
        const sub =
          existing ??
          (await createSubmission(
            assignment.assignment_id,
            assignment.preferred_language || "en",
            assignment.assessment_mode ?? "voice",
            { studentId: teacherId, isPreview: true },
          ));

        setSubmissionId(sub.submission_id);
        if (sub.generated_questions) {
          setGeneratedQuestions(sub.generated_questions);
          setGeneratedFromFileIds(sub.generated_from_file_ids ?? null);
        }
        await hydrateFromSubmission(sub.submission_id);
      } catch (err) {
        console.error("Error starting preview submission:", err);
        showErrorToast("Failed to start preview. Please try again.");
      } finally {
        setLoading(false);
        initializingRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRestart = useCallback(async () => {
    if (!submissionId || restarting) return;
    setRestarting(true);
    try {
      await resetPreviewSubmission(submissionId);
      // The submission id is unchanged, so the remounted core would otherwise
      // re-read the now-stale "answered/completed" attempt caches. Drop them so
      // the fresh DB state (in_progress, no attempts) is what gets re-fetched.
      await Promise.all([
        invalidateQuestionsWithAttemptsCache(submissionId),
        invalidateQuestionAttemptsNormalizedCache(submissionId),
        invalidateSubmissionByIdCache(),
      ]);
      setExistingAnswers({});
      setGeneratedQuestions(null);
      setGeneratedFromFileIds(null);
      setUploadedFiles([]);
      setPreviewEpoch((e) => e + 1);
    } catch (err) {
      console.error("Error restarting preview:", err);
      showErrorToast("Failed to restart preview. Please try again.");
    } finally {
      setRestarting(false);
    }
  }, [submissionId, restarting]);

  const showTentativeNote = assignment.feedback_requires_approval ?? false;

  if (!mounted) return null;

  return createPortal(
    <div className="grain-canvas fixed inset-0 z-50 flex flex-col bg-canvas">
      {/* Preview chrome */}
      <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Eye className="h-4 w-4 text-primary" />
          <span>Preview as Student</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRestart}
            disabled={loading || restarting || !submissionId}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            {restarting ? "Restarting..." : "Restart preview"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onExit}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            Exit preview
          </Button>
        </div>
      </div>

      {showTentativeNote && (
        <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-800 sm:px-6 dark:bg-amber-950/40 dark:text-amber-200">
          This activity holds feedback for approval, so scores shown here are
          tentative — exactly what a student would see before you release
          grades.
        </div>
      )}

      {/* Scrollable student experience */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-8">
        <div className="mx-auto w-full max-w-3xl">
          {loading || !submissionId ? (
            <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Starting preview...</span>
            </div>
          ) : (
            <ActivityTrackingProvider
              userId={teacherId}
              classId={classId}
              submissionId={submissionId}
            >
              <AssignmentResponseCore
                key={previewEpoch}
                previewMode
                assignmentData={assignment}
                submissionId={submissionId}
                displayName="Preview"
                preferredLanguage={assignment.preferred_language || "en"}
                contentItemId={null}
                forceComplete={false}
                assignmentId={assignment.assignment_id}
                existingAnswers={existingAnswers}
                fileUploadRequired={fileUploadRequired}
                uploadedFiles={uploadedFiles}
                onUploadedFilesChanged={setUploadedFiles}
                dynamicQuestionsEnabled={dynamicQuestionsEnabled}
                initialGeneratedQuestions={generatedQuestions}
                generatedFromFileIds={generatedFromFileIds}
                onDynamicQuestionsSaved={({
                  questions,
                  generatedFromFileIds: ids,
                }) => {
                  setGeneratedQuestions(questions);
                  setGeneratedFromFileIds(ids);
                }}
              />
            </ActivityTrackingProvider>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
