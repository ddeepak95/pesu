import useSWR, { mutate } from "swr";
import {
  getQuizByShortIdForTeacher,
  getQuizSubmissionsByQuizWithStudents,
  getQuizzesByIds,
  getQuizzesByIdsForStudent,
  QuizSubmissionStatus,
} from "@/lib/queries/quizzes";
import { Quiz } from "@/types/quiz";

/**
 * Fetch quizzes by their database UUIDs (teacher view — active + draft)
 */
export function useQuizzesByIds(ids: string[]) {
  const sortedKey = ids.length > 0 ? [...ids].sort().join(",") : null;
  return useSWR<Quiz[]>(
    sortedKey ? ["quizzesByIds", sortedKey] : null,
    () => getQuizzesByIds(ids)
  );
}

/**
 * Fetch quizzes by their database UUIDs (student view — active only)
 */
export function useQuizzesByIdsForStudent(ids: string[]) {
  const sortedKey = ids.length > 0 ? [...ids].sort().join(",") : null;
  return useSWR<Quiz[]>(
    sortedKey ? ["quizzesByIdsStudent", sortedKey] : null,
    () => getQuizzesByIdsForStudent(ids)
  );
}

/**
 * Fetch a single quiz by its public short id (teacher view — includes drafts).
 */
export function useQuizByShortIdForTeacher(shortId: string | null) {
  return useSWR<Quiz | null>(
    shortId ? ["quizByShortIdTeacher", shortId] : null,
    () => getQuizByShortIdForTeacher(shortId!)
  );
}

/**
 * Fetch all quiz submissions for a quiz, joined with student info. Pass
 * `null` to skip the fetch. `placementGroupId` scopes the student list to a
 * content feed group when the quiz is linked across groups.
 */
export function useQuizSubmissionsForQuiz(
  quiz: Quiz | null,
  placementGroupId?: string | null
) {
  return useSWR<QuizSubmissionStatus[]>(
    quiz
      ? ["quizSubmissionsForQuiz", quiz.id, quiz.class_id, placementGroupId ?? ""]
      : null,
    () => getQuizSubmissionsByQuizWithStudents(quiz!, { placementGroupId })
  );
}

/**
 * Invalidate every cached quiz-submission query.
 */
export function invalidateQuizSubmissionsCache() {
  return mutate(
    (key) =>
      Array.isArray(key) &&
      typeof key[0] === "string" &&
      key[0] === "quizSubmissionsForQuiz"
  );
}
