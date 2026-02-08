import { createClient } from "@/lib/supabase";
import { getCachedUser } from "@/lib/auth-cache";
import { SurveyAnswer, SurveyResponse } from "@/types/survey";

/** All columns for the survey_responses table */
const SURVEY_RESPONSE_ALL_COLUMNS =
  "id, survey_id, student_id, answers, submitted_at";

/**
 * Submit a survey response for the current user
 */
export async function submitSurveyResponse(
  surveyId: string,
  answers: SurveyAnswer[]
): Promise<SurveyResponse> {
  const supabase = createClient();
  const user = await getCachedUser();

  if (!user) throw new Error("User not authenticated");

  const { data, error } = await supabase
    .from("survey_responses")
    .insert({
      survey_id: surveyId,
      student_id: user.id,
      answers: answers,
    })
    .select()
    .single();

  if (error) throw error;
  return data as SurveyResponse;
}

/**
 * Get the current user's response for a survey
 */
export async function getStudentResponse(surveyId: string): Promise<SurveyResponse | null> {
  const supabase = createClient();
  const user = await getCachedUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("survey_responses")
    .select(SURVEY_RESPONSE_ALL_COLUMNS)
    .eq("survey_id", surveyId)
    .eq("student_id", user.id)
    .single();

  if (error) return null;
  return data as SurveyResponse;
}

/**
 * Check if the current user has already responded to a survey
 */
export async function hasStudentResponded(surveyId: string): Promise<boolean> {
  const response = await getStudentResponse(surveyId);
  return response !== null;
}

/**
 * Get all responses for a survey (teacher view)
 */
export async function getSurveyResponses(surveyId: string): Promise<SurveyResponse[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("survey_responses")
    .select(SURVEY_RESPONSE_ALL_COLUMNS)
    .eq("survey_id", surveyId)
    .order("submitted_at", { ascending: false });

  if (error) throw error;
  return (data || []) as SurveyResponse[];
}

/**
 * Get response count for a survey
 */
export async function getSurveyResponseCount(surveyId: string): Promise<number> {
  const supabase = createClient();

  const { count, error } = await supabase
    .from("survey_responses")
    .select("id", { count: "exact", head: true })
    .eq("survey_id", surveyId);

  if (error) throw error;
  return count ?? 0;
}
