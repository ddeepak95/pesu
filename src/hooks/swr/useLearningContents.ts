import useSWR from "swr";
import {
  getLearningContentsByIds,
  getLearningContentsByIdsForStudent,
} from "@/lib/queries/learningContent";
import { LearningContent } from "@/types/learningContent";

/**
 * Fetch learning contents by their database UUIDs (teacher view — active + draft)
 */
export function useLearningContentsByIds(ids: string[]) {
  const sortedKey = ids.length > 0 ? [...ids].sort().join(",") : null;
  return useSWR<LearningContent[]>(
    sortedKey ? ["learningContentsByIds", sortedKey] : null,
    () => getLearningContentsByIds(ids)
  );
}

/**
 * Fetch learning contents by their database UUIDs (student view — active only)
 */
export function useLearningContentsByIdsForStudent(ids: string[]) {
  const sortedKey = ids.length > 0 ? [...ids].sort().join(",") : null;
  return useSWR<LearningContent[]>(
    sortedKey ? ["learningContentsByIdsStudent", sortedKey] : null,
    () => getLearningContentsByIdsForStudent(ids)
  );
}
