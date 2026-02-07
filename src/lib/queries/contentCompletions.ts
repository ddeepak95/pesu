import { createClient } from "@/lib/supabase";
import { ContentCompletion, StudentContentCompletionWithDetails, ContentItemType } from "@/types/contentCompletion";
import { getContentItemsByClass } from "./contentItems";
import { getClassStudentsWithInfo } from "./students";
import { getLearningContentsByIds } from "./learningContent";
import { getAssignmentsByIdsForTeacher } from "./assignments";
import { getQuizzesByIds } from "./quizzes";
import { getSurveysByIds } from "./surveys";

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

/**
 * Get all content completions for a class (for teacher view)
 * Returns a flat list of student-content completion status for all students and content items
 */
export async function getClassContentCompletions(
  classDbId: string
): Promise<StudentContentCompletionWithDetails[]> {
  const supabase = createClient();

  // Fetch all required data in parallel
  const [contentItems, students] = await Promise.all([
    getContentItemsByClass(classDbId),
    getClassStudentsWithInfo(classDbId),
  ]);

  if (contentItems.length === 0 || students.length === 0) {
    return [];
  }

  // Group content items by type and collect ref_ids
  const learningContentIds: string[] = [];
  const assignmentIds: string[] = [];
  const quizIds: string[] = [];
  const surveyIds: string[] = [];

  for (const item of contentItems) {
    if (item.type === "learning_content") {
      learningContentIds.push(item.ref_id);
    } else if (item.type === "formative_assignment") {
      assignmentIds.push(item.ref_id);
    } else if (item.type === "quiz") {
      quizIds.push(item.ref_id);
    } else if (item.type === "survey") {
      surveyIds.push(item.ref_id);
    }
  }

  // Fetch content names in parallel
  const [learningContents, assignments, quizzes, surveys] = await Promise.all([
    learningContentIds.length > 0 ? getLearningContentsByIds(learningContentIds) : Promise.resolve([]),
    assignmentIds.length > 0 ? getAssignmentsByIdsForTeacher(assignmentIds) : Promise.resolve([]),
    quizIds.length > 0 ? getQuizzesByIds(quizIds) : Promise.resolve([]),
    surveyIds.length > 0 ? getSurveysByIds(surveyIds) : Promise.resolve([]),
  ]);

  // Create maps for quick lookup
  const contentNameMap = new Map<string, string>();
  
  for (const lc of learningContents) {
    contentNameMap.set(lc.id, lc.title);
  }
  for (const a of assignments) {
    contentNameMap.set(a.id, a.title);
  }
  for (const q of quizzes) {
    contentNameMap.set(q.id, q.title);
  }
  for (const s of surveys) {
    contentNameMap.set(s.id, s.title);
  }

  // Fetch all completions for these content items
  const contentItemIds = contentItems.map((ci) => ci.id);
  const { data: completionsData, error: completionsError } = await supabase
    .from("student_content_completions")
    .select("student_id, content_item_id, completed_at")
    .in("content_item_id", contentItemIds);

  if (completionsError) {
    console.error("Error fetching completions:", completionsError);
    throw completionsError;
  }

  // Create a set of completion keys for quick lookup
  const completionMap = new Map<string, string>();
  for (const c of completionsData || []) {
    const key = `${c.student_id}:${c.content_item_id}`;
    completionMap.set(key, c.completed_at);
  }

  // Build the result array
  const result: StudentContentCompletionWithDetails[] = [];

  for (const student of students) {
    const studentName =
      student.student_display_name ||
      student.student_email ||
      student.student_id.substring(0, 8) + "...";

    for (const contentItem of contentItems) {
      const key = `${student.student_id}:${contentItem.id}`;
      const completedAt = completionMap.get(key) || null;
      const contentName = contentNameMap.get(contentItem.ref_id) || "Unknown";

      result.push({
        studentId: student.student_id,
        studentName,
        studentEmail: student.student_email,
        contentItemId: contentItem.id,
        contentName,
        contentType: contentItem.type as ContentItemType,
        isComplete: !!completedAt,
        completedAt,
        contentGroupId: contentItem.class_group_id ?? null,
        studentGroupId: student.group_id ?? null,
      });
    }
  }

  return result;
}

/**
 * Reset all content completion progress for a student in a specific class
 * This deletes all completion marks, causing content to lock again if progressive unlock is enabled
 */
export async function resetStudentProgress(
  classId: string,
  studentId: string
): Promise<void> {
  const supabase = createClient();

  // Get all content items in this class
  const { data: contentItems, error: fetchError } = await supabase
    .from("content_items")
    .select("id")
    .eq("class_id", classId)
    .in("status", ["active", "draft"]);

  if (fetchError) {
    console.error("Error fetching content items:", fetchError);
    throw fetchError;
  }

  if (!contentItems || contentItems.length === 0) {
    // No content items to reset
    return;
  }

  const contentItemIds = contentItems.map((item) => item.id);

  // Delete all completions for this student in this class
  const { error: deleteError } = await supabase
    .from("student_content_completions")
    .delete()
    .eq("student_id", studentId)
    .in("content_item_id", contentItemIds);

  if (deleteError) {
    console.error("Error resetting student progress:", deleteError);
    throw deleteError;
  }
}
