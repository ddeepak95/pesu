import type { SupabaseClient } from "@supabase/supabase-js";
import type { getContentUnlockState } from "@/lib/dal";

export class QuizImageError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Dependencies are explicit so access decisions can be tested without cloud credentials. */
export async function authorizeQuizImageRead(
  imageId: string, userId: string, supabase: SupabaseClient, service: SupabaseClient,
  getUnlockState: typeof getContentUnlockState,
) {
  const { data: image } = await service.from("quiz_images").select("*").eq("id", imageId).eq("status", "ready").maybeSingle();
  if (!image) throw new QuizImageError("Image unavailable", 404);
  const { data: teacher } = await supabase.rpc("quiz_image_teacher", { p_class_id: image.class_id });
  if (teacher) return image;
  const { data: refs, error } = await service.from("quiz_image_references").select("quiz_id").eq("image_id", imageId);
  if (error) throw error;
  for (const ref of refs ?? []) {
    // User-scoped queries enforce quiz/group RLS, even though the asset index is private.
    const { data: quiz } = await supabase.from("quizzes").select("id,class_id,status").eq("id", ref.quiz_id).in("status", ["active", "draft"]).maybeSingle();
    if (!quiz) continue;
    const { data: manages } = await supabase.rpc("quiz_image_teacher", { p_class_id: quiz.class_id });
    if (manages) return image;
    if (quiz.status !== "active") continue;
    const { data: enrollment } = await supabase.from("class_students").select("student_id").eq("class_id", quiz.class_id).eq("student_id", userId).eq("status", "active").maybeSingle();
    if (!enrollment) continue;
    const { data: membership } = await supabase.from("class_group_memberships").select("group_id").eq("class_id", quiz.class_id).eq("student_id", userId).maybeSingle();
    if (!membership) continue;
    const { data: placements } = await supabase.from("content_items").select("id").eq("class_id", quiz.class_id).eq("class_group_id", membership.group_id).eq("type", "quiz").eq("ref_id", quiz.id).eq("status", "active");
    const { data: classRow } = await supabase.from("classes").select("class_id").eq("id", quiz.class_id).eq("status", "active").maybeSingle();
    if (!classRow) continue;
    for (const placement of placements ?? []) {
      const unlock = await getUnlockState(supabase, userId, classRow.class_id, quiz.id, "quiz", placement.id, true);
      if (unlock.contentItemId && unlock.classUuid && !unlock.isLocked) return image;
    }
  }
  throw new QuizImageError("Image unavailable", 404);
}
