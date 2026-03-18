import { createClient } from "@/lib/supabase";
import { getCachedUser } from "@/lib/auth-cache";
import { TeacherContentUnlock } from "@/types/contentItem";

/**
 * Get all teacher unlocks for a specific content item.
 * Returns all students who have been unlocked for this content item.
 */
export async function getTeacherUnlocksForContentItem(
  contentItemId: string
): Promise<TeacherContentUnlock[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("teacher_content_unlocks")
    .select("id, content_item_id, student_id, unlocked_by, unlocked_at")
    .eq("content_item_id", contentItemId);

  if (error) {
    console.error("Error fetching teacher unlocks for content item:", error);
    throw error;
  }

  return (data || []) as TeacherContentUnlock[];
}

/**
 * Get teacher unlocks for the current student across multiple content items.
 * Returns a Set of content_item_ids that have been unlocked for this student.
 */
export async function getTeacherUnlocksForStudent(
  contentItemIds: string[]
): Promise<Set<string>> {
  if (contentItemIds.length === 0) {
    return new Set();
  }

  const supabase = createClient();
  const user = await getCachedUser();

  if (!user) {
    return new Set();
  }

  const { data, error } = await supabase
    .from("teacher_content_unlocks")
    .select("content_item_id")
    .eq("student_id", user.id)
    .in("content_item_id", contentItemIds);

  if (error) {
    console.error("Error fetching teacher unlocks for student:", error);
    return new Set();
  }

  return new Set(data?.map((row) => row.content_item_id) || []);
}

/**
 * Get all teacher unlocks for content items in a class.
 * Used by the StudentProgressDialog to show unlock state for all students.
 * Returns a Map of "contentItemId:studentId" -> TeacherContentUnlock
 */
export async function getTeacherUnlocksForClass(
  classDbId: string
): Promise<Map<string, TeacherContentUnlock>> {
  const supabase = createClient();

  // First get all content item IDs in this class
  const { data: contentItems, error: ciError } = await supabase
    .from("content_items")
    .select("id")
    .eq("class_id", classDbId)
    .in("status", ["active", "draft"]);

  if (ciError) {
    console.error("Error fetching content items for class:", ciError);
    throw ciError;
  }

  const contentItemIds = (contentItems || []).map((ci) => ci.id);
  if (contentItemIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("teacher_content_unlocks")
    .select("id, content_item_id, student_id, unlocked_by, unlocked_at")
    .in("content_item_id", contentItemIds);

  if (error) {
    console.error("Error fetching teacher unlocks for class:", error);
    throw error;
  }

  const unlockMap = new Map<string, TeacherContentUnlock>();
  for (const unlock of data || []) {
    const key = `${unlock.content_item_id}:${unlock.student_id}`;
    unlockMap.set(key, unlock as TeacherContentUnlock);
  }

  return unlockMap;
}

/**
 * Get teacher unlocks for exactly one student, restricted to a set of content
 * items (typically already scoped to the student's assigned group).
 */
export async function getTeacherUnlocksForStudentInClass(params: {
  classDbId: string;
  studentId: string;
  contentItemIds: string[];
}): Promise<Set<string>> {
  const { studentId, contentItemIds } = params;

  if (contentItemIds.length === 0) {
    return new Set();
  }

  const supabase = createClient();

  // Note: `contentItemIds` should already be derived from the provided `classDbId`.
  const { data, error } = await supabase
    .from("teacher_content_unlocks")
    .select("content_item_id")
    .eq("student_id", studentId)
    .in("content_item_id", contentItemIds);

  if (error) {
    console.error("Error fetching teacher unlocks for student:", error);
    throw error;
  }

  return new Set(data?.map((row) => row.content_item_id) || []);
}

/**
 * Unlock a content item for a specific student.
 */
export async function unlockContentForStudent(
  contentItemId: string,
  studentId: string
): Promise<TeacherContentUnlock> {
  const supabase = createClient();
  const user = await getCachedUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  const { data, error } = await supabase
    .from("teacher_content_unlocks")
    .upsert(
      {
        content_item_id: contentItemId,
        student_id: studentId,
        unlocked_by: user.id,
        unlocked_at: new Date().toISOString(),
      },
      {
        onConflict: "content_item_id,student_id",
      }
    )
    .select()
    .single();

  if (error) {
    console.error("Error unlocking content for student:", error);
    throw error;
  }

  return data as TeacherContentUnlock;
}

/**
 * Re-lock a content item for a specific student (remove the unlock).
 */
export async function lockContentForStudent(
  contentItemId: string,
  studentId: string
): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("teacher_content_unlocks")
    .delete()
    .eq("content_item_id", contentItemId)
    .eq("student_id", studentId);

  if (error) {
    console.error("Error locking content for student:", error);
    throw error;
  }
}

/**
 * Bulk unlock a content item for multiple students at once.
 */
export async function bulkUnlockContentForStudents(
  contentItemId: string,
  studentIds: string[]
): Promise<void> {
  if (studentIds.length === 0) return;

  const supabase = createClient();
  const user = await getCachedUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  const rows = studentIds.map((studentId) => ({
    content_item_id: contentItemId,
    student_id: studentId,
    unlocked_by: user.id,
    unlocked_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("teacher_content_unlocks")
    .upsert(rows, {
      onConflict: "content_item_id,student_id",
    });

  if (error) {
    console.error("Error bulk unlocking content:", error);
    throw error;
  }
}
