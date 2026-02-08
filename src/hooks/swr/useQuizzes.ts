import useSWR from "swr";
import {
  getQuizzesByIds,
  getQuizzesByIdsForStudent,
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
