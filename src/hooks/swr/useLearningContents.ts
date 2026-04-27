import useSWR from "swr";
import {
  getLearningContentByShortIdForTeacher,
  getLearningContentsByIds,
  getLearningContentsByIdsForStudent,
} from "@/lib/queries/learningContent";
import { LearningContent } from "@/types/learningContent";

/**
 * Fetch a single learning content by its public short id (teacher view —
 * includes drafts).
 */
export function useLearningContentByShortIdForTeacher(shortId: string | null) {
  return useSWR<LearningContent | null>(
    shortId ? ["learningContentByShortIdTeacher", shortId] : null,
    () => getLearningContentByShortIdForTeacher(shortId!)
  );
}

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
