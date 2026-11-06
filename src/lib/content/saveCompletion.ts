import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContentCompletion } from "@/types/contentCompletion";

/** Insert once: retries must neither require UPDATE permission nor restart day delays. */
export async function saveContentCompletion(
  supabase: SupabaseClient,
  studentId: string,
  contentItemId: string,
): Promise<ContentCompletion> {
  const { error } = await supabase.from("student_content_completions").upsert(
    { student_id: studentId, content_item_id: contentItemId },
    { onConflict: "student_id,content_item_id", ignoreDuplicates: true },
  );
  if (error) throw error;

  // DO NOTHING returns no row on conflict. Read the persisted row in either case.
  const { data, error: readError } = await supabase
    .from("student_content_completions")
    .select("*")
    .eq("student_id", studentId)
    .eq("content_item_id", contentItemId)
    .single();
  if (readError) throw readError;
  if (!data) throw new Error("Completion was not persisted");
  return data as ContentCompletion;
}
