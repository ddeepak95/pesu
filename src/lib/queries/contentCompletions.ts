import { createClient } from "@/lib/supabase";
import { ContentCompletion } from "@/types/contentCompletion";

/**
 * Mark a content item as complete for the current user
 */
export async function markContentAsComplete(
  contentItemId: string
): Promise<ContentCompletion> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  const { data, error } = await supabase
    .from("student_content_completions")
    .upsert(
      {
        student_id: user.id,
        content_item_id: contentItemId,
        completed_at: new Date().toISOString(),
      },
      {
        onConflict: "student_id,content_item_id",
      }
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as ContentCompletion;
}

/**
 * Remove completion mark for a content item
 */
export async function unmarkContentComplete(
  contentItemId: string
): Promise<void> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  const { error } = await supabase
    .from("student_content_completions")
    .delete()
    .eq("student_id", user.id)
    .eq("content_item_id", contentItemId);

  if (error) {
    throw error;
  }
}

/**
 * Get completions for multiple content items for the current user
 * Returns a Set of completed content item IDs for efficient lookup
 */
export async function getCompletionsForStudent(
  contentItemIds: string[]
): Promise<Set<string>> {
  if (contentItemIds.length === 0) {
    return new Set();
  }

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Set();
  }

  const { data, error } = await supabase
    .from("student_content_completions")
    .select("content_item_id")
    .eq("student_id", user.id)
    .in("content_item_id", contentItemIds);

  if (error) {
    console.error("Error fetching completions:", error);
    return new Set();
  }

  return new Set(data?.map((c) => c.content_item_id) || []);
}

/**
 * Check if a single content item is complete for the current user
 */
export async function isContentComplete(
  contentItemId: string
): Promise<boolean> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  const { data, error } = await supabase
    .from("student_content_completions")
    .select("id")
    .eq("student_id", user.id)
    .eq("content_item_id", contentItemId)
    .maybeSingle();

  if (error) {
    console.error("Error checking completion:", error);
    return false;
  }

  return !!data;
}
