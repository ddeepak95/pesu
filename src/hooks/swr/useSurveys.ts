import useSWR from "swr";
import {
  getSurveysByIds,
  getSurveysByIdsForStudent,
} from "@/lib/queries/surveys";
import { Survey } from "@/types/survey";

/**
 * Fetch surveys by their database UUIDs (teacher view — active + draft)
 */
export function useSurveysByIds(ids: string[]) {
  const sortedKey = ids.length > 0 ? [...ids].sort().join(",") : null;
  return useSWR<Survey[]>(
    sortedKey ? ["surveysByIds", sortedKey] : null,
    () => getSurveysByIds(ids)
  );
}

/**
 * Fetch surveys by their database UUIDs (student view — active only)
 */
export function useSurveysByIdsForStudent(ids: string[]) {
  const sortedKey = ids.length > 0 ? [...ids].sort().join(",") : null;
  return useSWR<Survey[]>(
    sortedKey ? ["surveysByIdsStudent", sortedKey] : null,
    () => getSurveysByIdsForStudent(ids)
  );
}
