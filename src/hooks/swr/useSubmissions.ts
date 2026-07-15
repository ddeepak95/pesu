import useSWR, { mutate } from "swr";
import {
  getPublicSubmissionsByAssignment,
  getQuestionAttemptsNormalized,
  getQuestionsWithAttempts,
  getSubmissionById,
  getSubmissionByStudentAndAssignment,
  getSubmissionForSessionRestore,
  getSubmissionGrading,
  getSubmissionsByAssignmentWithStudents,
  getTranscript,
  getTranscriptsForSubmission,
  NormalizedQuestionAttempts,
  PublicSubmissionStatus,
  StudentSubmissionStatus,
  SubmissionGrading,
} from "@/lib/queries/submissions";
import {
  getChatMessages,
  type ChatMessageRow,
} from "@/lib/queries/chatMessages";
import { getChatMessageActionsForMessages } from "@/lib/queries/chatMessageActions";
import type { PendingAction } from "@/components/Shared/KonvoVoice/actionTypes";
import {
  getVoiceMessagesForAttempt,
  type VoiceMessageRow,
} from "@/lib/queries/voiceMessages";
import {
  Submission,
  SubmissionTranscript,
} from "@/types/submission";

/**
 * Fetch all submissions for an assignment, optionally scoped to a class group.
 */
export function useSubmissionsForAssignment(params: {
  assignmentId: string | null;
  classId: string | null;
  classGroupId?: string | null;
}) {
  const { assignmentId, classId, classGroupId = null } = params;
  return useSWR<StudentSubmissionStatus[]>(
    assignmentId && classId
      ? [
          "submissionsForAssignment",
          assignmentId,
          classId,
          classGroupId ?? "__all__",
        ]
      : null,
    () =>
      getSubmissionsByAssignmentWithStudents(
        assignmentId!,
        classId!,
        classGroupId
      )
  );
}

/**
 * Fetch all public-link submissions for an assignment.
 */
export function usePublicSubmissionsForAssignment(assignmentId: string | null) {
  return useSWR<PublicSubmissionStatus[]>(
    assignmentId ? ["publicSubmissionsForAssignment", assignmentId] : null,
    () => getPublicSubmissionsByAssignment(assignmentId!)
  );
}

/**
 * Fetch all chat messages (student + assistant) for a single attempt.
 * Pass `null` for any param to skip the fetch.
 */
export function useChatMessages(params: {
  submissionId: string | null;
  questionId: string | null;
  attemptNumber: number | null;
}) {
  const { submissionId, questionId, attemptNumber } = params;
  return useSWR<ChatMessageRow[]>(
    submissionId && questionId !== null && attemptNumber !== null
      ? ["chatMessages", submissionId, questionId, attemptNumber]
      : null,
    () => getChatMessages(submissionId!, questionId!, attemptNumber!),
  );
}

/**
 * Fetch all actions for a set of chat message IDs, keyed by chat_message_id.
 * Pass an empty array (or wait until messages are loaded) to skip.
 */
export function useChatMessageActions(chatMessageIds: string[]) {
  return useSWR<Record<string, PendingAction>>(
    chatMessageIds.length > 0
      ? ["chatMessageActions", ...chatMessageIds]
      : null,
    () => getChatMessageActionsForMessages(chatMessageIds),
  );
}

/**
 * Fetch all voice_messages rows (audio URLs) for a single attempt.
 * Pass `null` for any param to skip the fetch.
 */
export function useVoiceMessagesForAttempt(params: {
  submissionId: string | null;
  questionId: string | null;
  attemptNumber: number | null;
}) {
  const { submissionId, questionId, attemptNumber } = params;
  return useSWR<VoiceMessageRow[]>(
    submissionId && questionId !== null && attemptNumber !== null
      ? ["voiceMessagesForAttempt", submissionId, questionId, attemptNumber]
      : null,
    () => getVoiceMessagesForAttempt(submissionId!, questionId!, attemptNumber!),
  );
}

/**
 * Fetch the transcript text for a single attempt. Pass `null` for any param
 * to skip the fetch.
 */
export function useTranscript(params: {
  submissionId: string | null;
  questionId: string | null;
  attemptNumber: number | null;
}) {
  const { submissionId, questionId, attemptNumber } = params;
  return useSWR<string | null>(
    submissionId && questionId !== null && attemptNumber !== null
      ? ["transcript", submissionId, questionId, attemptNumber]
      : null,
    () => getTranscript(submissionId!, questionId!, attemptNumber!)
  );
}

/**
 * Fetch a full submission row (including the evaluations JSONB).
 */
export function useSubmissionById(submissionId: string | null) {
  return useSWR<Submission | null>(
    submissionId ? ["submissionById", submissionId] : null,
    () => getSubmissionById(submissionId!)
  );
}

/**
 * Fetch the partial submission row used to restore a session
 * (assignment_id, student_id, responder_details, integrity_lock).
 */
export function useSubmissionForSessionRestore(submissionId: string | null) {
  return useSWR(
    submissionId ? ["submissionForSessionRestore", submissionId] : null,
    () => getSubmissionForSessionRestore(submissionId!)
  );
}

/**
 * Look up the submission_id for a (student, assignment) pair.
 */
export function useSubmissionByStudentAndAssignment(params: {
  studentId: string | null;
  assignmentId: string | null;
}) {
  const { studentId, assignmentId } = params;
  return useSWR<{ submission_id: string } | null>(
    studentId && assignmentId
      ? ["submissionByStudentAndAssignment", studentId, assignmentId]
      : null,
    () => getSubmissionByStudentAndAssignment(studentId!, assignmentId!)
  );
}

/**
 * Fetch all transcript rows for a submission (across questions/attempts).
 */
export function useTranscriptsForSubmission(submissionId: string | null) {
  return useSWR<SubmissionTranscript[]>(
    submissionId ? ["transcriptsForSubmission", submissionId] : null,
    () => getTranscriptsForSubmission(submissionId!)
  );
}

/**
 * Fetch a question's attempts from the normalized tables. Each attempt carries a
 * derived `released` flag; the result also exposes the question's selected attempt
 * id. This is the read path the student UI uses for tentative-vs-final feedback.
 */
export function useQuestionAttemptsNormalized(params: {
  submissionId: string | null;
  questionId: string | null;
  excludeStale?: boolean;
}) {
  const { submissionId, questionId, excludeStale = false } = params;
  return useSWR<NormalizedQuestionAttempts>(
    submissionId && questionId !== null
      ? ["questionAttemptsNormalized", submissionId, questionId, excludeStale]
      : null,
    () => getQuestionAttemptsNormalized(submissionId!, questionId!, excludeStale)
  );
}

/**
 * Invalidate every cached `useQuestionAttemptsNormalized` query for a submission.
 * Call after submitting an attempt, changing the selected attempt, or release.
 */
export function invalidateQuestionAttemptsNormalizedCache(submissionId?: string) {
  return mutate(
    (key) =>
      Array.isArray(key) &&
      typeof key[0] === "string" &&
      key[0] === "questionAttemptsNormalized" &&
      (submissionId === undefined || key[1] === submissionId)
  );
}

/**
 * Change the selected (counted) attempt for a question and revalidate the
 * normalized attempts cache. Used by the student attempt selector and teacher
 * override. Returns the API response so callers can surface errors (e.g. frozen).
 */
export async function selectAttempt(params: {
  submissionId: string;
  questionId: string;
  attemptNumber: number;
}): Promise<Response> {
  const res = await fetch("/api/submissions/select-attempt", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (res.ok) {
    await invalidateQuestionAttemptsNormalizedCache(params.submissionId);
  }
  return res;
}

/**
 * Teacher grading read for a submission: all questions/attempts with AI audit,
 * selection, per-question released score + review flag, and release state.
 */
export function useSubmissionGrading(submissionId: string | null) {
  return useSWR<SubmissionGrading>(
    submissionId ? ["submissionGrading", submissionId] : null,
    () => getSubmissionGrading(submissionId!)
  );
}

/** Invalidate cached `useSubmissionGrading` for a submission (or all). */
export function invalidateSubmissionGradingCache(submissionId?: string) {
  return mutate(
    (key) =>
      Array.isArray(key) &&
      typeof key[0] === "string" &&
      key[0] === "submissionGrading" &&
      (submissionId === undefined || key[1] === submissionId)
  );
}

/**
 * Fetch the set of question ids that already have at least one
 * non-stale attempt for the submission.
 */
export function useQuestionsWithAttempts(submissionId: string | null) {
  return useSWR<Set<string>>(
    submissionId ? ["questionsWithAttempts", submissionId] : null,
    () => getQuestionsWithAttempts(submissionId!),
    {
      compare: (a, b) => {
        if (a === b) return true;
        if (!a || !b || a.size !== b.size) return false;
        for (const v of a) if (!b.has(v)) return false;
        return true;
      },
    }
  );
}

/**
 * Invalidate cached `useQuestionsWithAttempts` for a submission.
 */
export function invalidateQuestionsWithAttemptsCache(submissionId?: string) {
  return mutate(
    (key) =>
      Array.isArray(key) &&
      typeof key[0] === "string" &&
      key[0] === "questionsWithAttempts" &&
      (submissionId === undefined || key[1] === submissionId)
  );
}

/**
 * Invalidate every cached `useSubmissionById` query.
 */
export function invalidateSubmissionByIdCache() {
  return mutate(
    (key) =>
      Array.isArray(key) &&
      typeof key[0] === "string" &&
      key[0] === "submissionById"
  );
}

/**
 * Invalidate every cached submission list (call after grading mutations).
 */
export function invalidateSubmissionsCache() {
  return mutate(
    (key) =>
      Array.isArray(key) &&
      typeof key[0] === "string" &&
      (key[0] === "submissionsForAssignment" ||
        key[0] === "publicSubmissionsForAssignment" ||
        key[0] === "studentIdsPendingApprovalsByClass" ||
        key[0] === "classStudentContentCompletions")
  );
}
