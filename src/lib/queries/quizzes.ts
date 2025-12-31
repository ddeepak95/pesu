import { createClient } from "@/lib/supabase";
import { nanoid } from "nanoid";
import { MCQQuestion, Quiz } from "@/types/quiz";

function generateQuizId(): string {
  return nanoid(8);
}

export async function getQuizzesByIds(ids: string[]): Promise<Quiz[]> {
  const supabase = createClient();
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("quizzes")
    .select("*")
    .in("id", ids)
    .in("status", ["active", "draft"]);

  if (error) throw error;
  return (data || []) as Quiz[];
}

/**
 * Get a single quiz by its unique quiz_id (student view)
 * Only returns active quizzes (excludes deleted and draft ones)
 */
export async function getQuizByShortId(quizId: string): Promise<Quiz | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("quizzes")
    .select("*")
    .eq("quiz_id", quizId)
    .eq("status", "active")
    .single();

  if (error) return null;
  return data as Quiz;
}

export async function getQuizByShortIdForTeacher(quizId: string): Promise<Quiz | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("quizzes")
    .select("*")
    .eq("quiz_id", quizId)
    .in("status", ["active", "draft"])
    .single();

  if (error) return null;
  return data as Quiz;
}

export async function createQuiz(
  payload: {
    class_id: string;
    class_group_id?: string | null;
    title: string;
    questions: MCQQuestion[];
    status?: "draft" | "active";
  },
  userId: string
): Promise<Quiz> {
  const supabase = createClient();
  const quizId = generateQuizId();

  const cleanedQuestions = payload.questions.map((q, idx) => ({
    ...q,
    order: idx,
  }));

  const totalPoints = cleanedQuestions.reduce((sum, q) => sum + (q.points || 0), 0);

  const { data, error } = await supabase
    .from("quizzes")
    .insert({
      quiz_id: quizId,
      class_id: payload.class_id,
      class_group_id: payload.class_group_id ?? null,
      title: payload.title.trim(),
      questions: cleanedQuestions,
      total_points: totalPoints,
      created_by: userId,
      status: payload.status ?? "active",
    })
    .select()
    .single();

  if (error) throw error;
  return data as Quiz;
}

export async function updateQuiz(
  id: string,
  payload: {
    title: string;
    questions: MCQQuestion[];
    status?: "draft" | "active";
  }
): Promise<Quiz> {
  const supabase = createClient();

  const cleanedQuestions = payload.questions.map((q, idx) => ({
    ...q,
    order: idx,
  }));

  const totalPoints = cleanedQuestions.reduce((sum, q) => sum + (q.points || 0), 0);

  const { data, error } = await supabase
    .from("quizzes")
    .update({
      title: payload.title.trim(),
      questions: cleanedQuestions,
      total_points: totalPoints,
      status: payload.status ?? "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Quiz;
}

export async function deleteQuiz(id: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("quizzes")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}



