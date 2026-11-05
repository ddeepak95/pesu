import type { SupabaseClient } from "@supabase/supabase-js";
import { QuizImageError } from "./imageAccess";

/** Claim first, delete bytes second, remove metadata last. Retrying is idempotent. */
export async function deleteQuizImageAsset(
  service: SupabaseClient, classId: string, imageId: string,
  deleteObject: (path: string) => Promise<unknown>,
) {
  const { data: path, error } = await service.rpc("claim_quiz_image_deletion", { p_class_id: classId, p_image_id: imageId });
  if (error) {
    if (error.code === "23503" || error.code === "23514") throw new QuizImageError(error.message, 409);
    throw error;
  }
  if (!path) return;
  await deleteObject(path);
  const { error: deleteError } = await service.from("quiz_images").delete().eq("id", imageId).eq("class_id", classId).eq("status", "deleting");
  if (deleteError) throw deleteError;
}
