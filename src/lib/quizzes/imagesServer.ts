import "server-only";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";
import { getContentUnlockState } from "@/lib/dal";

import { authorizeQuizImageRead, QuizImageError } from "./imageAccess";
export { QuizImageError } from "./imageAccess";

export async function requireQuizImageTeacher(classId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new QuizImageError("Sign in to upload images", 401);
  const { data: allowed, error } = await supabase.rpc("quiz_image_teacher", { p_class_id: classId });
  if (error || !allowed) throw new QuizImageError("Teacher access required", 403);
  return { supabase, user };
}

export async function requireQuizImageRead(imageId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new QuizImageError("Sign in to view images", 401);
  return authorizeQuizImageRead(imageId, user.id, supabase, createServiceRoleClient(), getContentUnlockState);
}
