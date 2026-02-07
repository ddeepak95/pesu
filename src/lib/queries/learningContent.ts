import { createClient } from "@/lib/supabase";
import { nanoid } from "nanoid";
import { LearningContent, LearningContentType } from "@/types/learningContent";

function generateLearningContentId(): string {
  return nanoid(8);
}

function computeContentType(videoUrl: string | null, body: string | null): LearningContentType {
  const hasVideo = Boolean(videoUrl && videoUrl.trim());
  const hasBody = Boolean(body && body.trim());
  if (hasVideo && hasBody) return "mixed";
  if (hasVideo) return "video";
  return "text";
}

export async function getLearningContentsByIds(ids: string[]): Promise<LearningContent[]> {
  const supabase = createClient();
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("learning_contents")
    .select("*")
    .in("id", ids)
    .in("status", ["active", "draft"]);

  if (error) throw error;
  return (data || []) as LearningContent[];
}

/**
 * Get learning contents by their database UUID primary keys (student view).
 * Only returns active learning contents (excludes draft and deleted).
 */
export async function getLearningContentsByIdsForStudent(ids: string[]): Promise<LearningContent[]> {
  const supabase = createClient();
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("learning_contents")
    .select("*")
    .in("id", ids)
    .eq("status", "active");

  if (error) throw error;
  return (data || []) as LearningContent[];
}

export async function getLearningContentByShortId(
  learningContentId: string
): Promise<LearningContent | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("learning_contents")
    .select("*")
    .eq("learning_content_id", learningContentId)
    .eq("status", "active")
    .single();

  if (error) return null;
  return data as LearningContent;
}

export async function getLearningContentByShortIdForTeacher(
  learningContentId: string
): Promise<LearningContent | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("learning_contents")
    .select("*")
    .eq("learning_content_id", learningContentId)
    .in("status", ["active", "draft"])
    .single();

  if (error) return null;
  return data as LearningContent;
}

export async function createLearningContent(
  payload: {
    class_id: string;
    class_group_id?: string | null;
    title: string;
    video_url?: string | null;
    body?: string | null;
    status?: "draft" | "active";
  },
  userId: string
): Promise<LearningContent> {
  const supabase = createClient();
  const learningContentId = generateLearningContentId();

  const videoUrl = payload.video_url?.trim() || null;
  const body = payload.body?.trim() || null;
  const contentType = computeContentType(videoUrl, body);

  const { data, error } = await supabase
    .from("learning_contents")
    .insert({
      learning_content_id: learningContentId,
      class_id: payload.class_id,
      class_group_id: payload.class_group_id ?? null,
      title: payload.title.trim(),
      content_type: contentType,
      video_url: videoUrl,
      body,
      created_by: userId,
      status: payload.status ?? "active",
    })
    .select()
    .single();

  if (error) throw error;
  return data as LearningContent;
}

export async function updateLearningContent(
  id: string,
  payload: {
    title: string;
    video_url?: string | null;
    body?: string | null;
    status?: "draft" | "active";
  }
): Promise<LearningContent> {
  const supabase = createClient();

  const videoUrl = payload.video_url?.trim() || null;
  const body = payload.body?.trim() || null;
  const contentType = computeContentType(videoUrl, body);

  const { data, error } = await supabase
    .from("learning_contents")
    .update({
      title: payload.title.trim(),
      content_type: contentType,
      video_url: videoUrl,
      body,
      status: payload.status ?? "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as LearningContent;
}

export async function deleteLearningContent(id: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("learning_contents")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}




