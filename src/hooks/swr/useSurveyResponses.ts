import useSWR, { mutate } from "swr";
import {
  getSurveyResponsesWithStudents,
  SurveyResponseWithStudent,
} from "@/lib/queries/surveyResponses";

/**
 * Fetch all responses for a survey within a class.
 */
export function useSurveyResponses(params: {
  surveyId: string | null;
  classDbId: string | null;
}) {
  const { surveyId, classDbId } = params;
  return useSWR<SurveyResponseWithStudent[]>(
    surveyId && classDbId ? ["surveyResponses", surveyId, classDbId] : null,
    () => getSurveyResponsesWithStudents(surveyId!, classDbId!)
  );
}

/**
 * Invalidate every cached survey-response query.
 */
export function invalidateSurveyResponsesCache() {
  return mutate(
    (key) =>
      Array.isArray(key) && typeof key[0] === "string" && key[0] === "surveyResponses"
  );
}
