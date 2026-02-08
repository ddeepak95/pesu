import { createClient } from "@/lib/supabase";
import { nanoid } from "nanoid";
import { Survey, SurveyQuestion } from "@/types/survey";

function generateSurveyId(): string {
  return nanoid(8);
}

export async function getSurveysByIds(ids: string[]): Promise<Survey[]> {
  const supabase = createClient();
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("surveys")
    .select("id, survey_id, title, status")
    .in("id", ids)
    .in("status", ["active", "draft"]);

  if (error) throw error;
  return (data || []) as Survey[];
}

/**
 * Get surveys by their database UUID primary keys (student view).
 * Only returns active surveys (excludes draft and deleted).
 */
export async function getSurveysByIdsForStudent(ids: string[]): Promise<Survey[]> {
  const supabase = createClient();
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("surveys")
    .select("id, survey_id, title, status")
    .in("id", ids)
    .eq("status", "active");

  if (error) throw error;
  return (data || []) as Survey[];
}

/**
 * Get a single survey by its unique survey_id (student view)
 * Only returns active surveys (excludes deleted and draft ones)
 */
export async function getSurveyByShortId(surveyId: string): Promise<Survey | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("surveys")
    .select("*")
    .eq("survey_id", surveyId)
    .eq("status", "active")
    .single();

  if (error) return null;
  return data as Survey;
}

/**
 * Get a single survey by its unique survey_id (teacher view)
 * Returns active and draft surveys
 */
export async function getSurveyByShortIdForTeacher(surveyId: string): Promise<Survey | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("surveys")
    .select("*")
    .eq("survey_id", surveyId)
    .in("status", ["active", "draft"])
    .single();

  if (error) return null;
  return data as Survey;
}

export async function createSurvey(
  payload: {
    class_id: string;
    class_group_id?: string | null;
    title: string;
    description?: string | null;
    questions: SurveyQuestion[];
    status?: "draft" | "active";
  },
  userId: string
): Promise<Survey> {
  const supabase = createClient();
  const surveyId = generateSurveyId();

  // Normalize question order
  const cleanedQuestions = payload.questions.map((q, idx) => ({
    ...q,
    order: idx,
  }));

  const { data, error } = await supabase
    .from("surveys")
    .insert({
      survey_id: surveyId,
      class_id: payload.class_id,
      class_group_id: payload.class_group_id ?? null,
      title: payload.title.trim(),
      description: payload.description?.trim() || null,
      questions: cleanedQuestions,
      created_by: userId,
      status: payload.status ?? "active",
    })
    .select()
    .single();

  if (error) throw error;
  return data as Survey;
}

export async function updateSurvey(
  id: string,
  payload: {
    title: string;
    description?: string | null;
    questions: SurveyQuestion[];
    status?: "draft" | "active";
  }
): Promise<Survey> {
  const supabase = createClient();

  // Normalize question order
  const cleanedQuestions = payload.questions.map((q, idx) => ({
    ...q,
    order: idx,
  }));

  const { data, error } = await supabase
    .from("surveys")
    .update({
      title: payload.title.trim(),
      description: payload.description?.trim() || null,
      questions: cleanedQuestions,
      status: payload.status ?? "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Survey;
}

export async function deleteSurvey(id: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("surveys")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}
