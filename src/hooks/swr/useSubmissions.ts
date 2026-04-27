import useSWR, { mutate } from "swr";
import {
  getPublicSubmissionsByAssignment,
  getQuestionAttempts,
  getQuestionsWithAttempts,
  getSubmissionById,
  getSubmissionByStudentAndAssignment,
  getSubmissionForSessionRestore,
  getSubmissionsByAssignmentWithStudents,
  getTranscript,
  getTranscriptsForSubmission,
  PublicSubmissionStatus,
  StudentSubmissionStatus,
} from "@/lib/queries/submissions";
import {
  Submission,
  SubmissionAttempt,
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
 * Fetch the transcript text for a single attempt. Pass `null` for any param
 * to skip the fetch.
 */
export function useTranscript(params: {
  submissionId: string | null;
  questionOrder: number | null;
  attemptNumber: number | null;
}) {
  const { submissionId, questionOrder, attemptNumber } = params;
  return useSWR<string | null>(
    submissionId && questionOrder !== null && attemptNumber !== null
      ? ["transcript", submissionId, questionOrder, attemptNumber]
      : null,
    () => getTranscript(submissionId!, questionOrder!, attemptNumber!)
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
 * Fetch all attempts for a single question. `excludeStale` defaults to false
 * to match the underlying query default.
 */
export function useQuestionAttempts(params: {
  submissionId: string | null;
  questionOrder: number | null;
  excludeStale?: boolean;
}) {
  const { submissionId, questionOrder, excludeStale = false } = params;
  return useSWR<SubmissionAttempt[]>(
    submissionId && questionOrder !== null
      ? ["questionAttempts", submissionId, questionOrder, excludeStale]
      : null,
    () => getQuestionAttempts(submissionId!, questionOrder!, excludeStale)
  );
}

/**
 * Invalidate every cached `useQuestionAttempts` query for a submission.
 */
export function invalidateQuestionAttemptsCache(submissionId?: string) {
  return mutate(
    (key) =>
      Array.isArray(key) &&
      typeof key[0] === "string" &&
      key[0] === "questionAttempts" &&
      (submissionId === undefined || key[1] === submissionId)
  );
}

/**
 * Fetch the set of question orders that already have at least one
 * non-stale attempt for the submission.
 */
export function useQuestionsWithAttempts(submissionId: string | null) {
  return useSWR<Set<number>>(
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
        key[0] === "publicSubmissionsForAssignment")
  );
}
