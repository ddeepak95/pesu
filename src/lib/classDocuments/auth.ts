import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function teacherClient(classId: string) {
  const db = await createServerSupabaseClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data } = await db.from("class_teachers").select("class_id").eq("class_id", classId).eq("teacher_id", user.id).maybeSingle();
  return data ? { db, user } : null;
}

export async function documentAccess(documentId: string) {
  const db = await createServerSupabaseClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: document } = await db.from("class_documents").select("*").eq("id", documentId).maybeSingle();
  if (!document) return null;
  const { data: membership } = await db.from("class_teachers").select("class_id").eq("class_id", document.class_id).eq("teacher_id", user.id).maybeSingle();
  return membership ? { db, user, document } : null;
}
