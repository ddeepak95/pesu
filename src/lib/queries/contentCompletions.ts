import { createClient } from "@/lib/supabase";
import { getCachedUser } from "@/lib/auth-cache";
import { ContentCompletion, StudentContentCompletionWithDetails, ContentItemType } from "@/types/contentCompletion";
import { getContentItemsByClass } from "./contentItems";
import { getClassStudentsWithInfo } from "./students";
import { getLearningContentsByIds } from "./learningContent";
import { getAssignmentsByIdsForTeacher } from "./assignments";
import { getQuizzesByIds, deleteQuizSubmissionForStudent } from "./quizzes";
import { getSurveysByIds } from "./surveys";
import { deleteSurveyResponseForStudent } from "./surveyResponses";
import { getSubmissionByStudentAndAssignment, markAttemptsAsStale } from "./submissions";

/**
 * Mark a content item as complete for the current user
 */
export async function markContentAsComplete(
  contentItemId: string
): Promise<ContentCompletion> {
  const supabase = createClient();
  const user = await getCachedUser();

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
  const user = await getCachedUser();

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
  const user = await getCachedUser();

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
 * Get completions with dates for multiple content items for the current user.
 * Returns a Map of content_item_id -> completed_at (ISO string) for unlock logic
 * that needs day-delay calculations.
 */
export async function getCompletionsWithDatesForStudent(
  contentItemIds: string[]
): Promise<Map<string, string>> {
  if (contentItemIds.length === 0) {
    return new Map();
  }

  const supabase = createClient();
  const user = await getCachedUser();

  if (!user) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("student_content_completions")
    .select("content_item_id, completed_at")
    .eq("student_id", user.id)
    .in("content_item_id", contentItemIds);

  if (error) {
    console.error("Error fetching completions with dates:", error);
    return new Map();
  }

  const map = new Map<string, string>();
  for (const c of data || []) {
    if (c.completed_at) {
      map.set(c.content_item_id, c.completed_at);
    }
  }
  return map;
}

/**
 * Check if a single content item is complete for the current user
 */
export async function isContentComplete(
  contentItemId: string
): Promise<boolean> {
  const supabase = createClient();
  const user = await getCachedUser();

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
 * Get all completions for a single content item (teacher view).
 * Returns student_id and completed_at for each completion.
 */
export async function getCompletionsByContentItem(
  contentItemId: string
): Promise<{ student_id: string; completed_at: string }[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("student_content_completions")
    .select("student_id, completed_at")
    .eq("content_item_id", contentItemId);

  if (error) {
    console.error("Error fetching completions by content item:", error);
    throw error;
  }

  return (data || []) as { student_id: string; completed_at: string }[];
}

/**
 * Remove completion mark for a specific student/content pair (teacher reset flows).
 */
export async function deleteContentCompletionForStudent(params: {
  contentItemId: string;
  studentId: string;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("student_content_completions")
    .delete()
    .eq("content_item_id", params.contentItemId)
    .eq("student_id", params.studentId);

  if (error) {
    throw error;
  }
}

export interface ClassStudentProgressSummaryRow {
  student_id: string;
  total: number;
  completed: number;
  last_completed_at: string | null;
}

/**
 * Per-student completion aggregates for a class (teacher/co-teacher only).
 * Group-scoped totals match `getClassContentCompletions` / Progress tab semantics.
 */
export async function getClassStudentProgressSummary(
  classDbId: string
): Promise<ClassStudentProgressSummaryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_class_student_progress_summary", {
    p_class_id: classDbId,
  });
  if (error) throw error;
  type RpcRow = {
    student_id: string;
    total: number | string | null;
    completed: number | string | null;
    last_completed_at: string | null;
  };
  return ((data ?? []) as RpcRow[]).map((row) => ({
    student_id: row.student_id,
    total: Number(row.total ?? 0),
    completed: Number(row.completed ?? 0),
    last_completed_at: row.last_completed_at ?? null,
  }));
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

  // Fetch all completions for these content items (paginated to avoid
  // Supabase's default 1000-row limit silently truncating results).
  const contentItemIds = contentItems.map((ci) => ci.id);
  const PAGE_SIZE = 1000;
  const allCompletions: { student_id: string; content_item_id: string; completed_at: string }[] = [];
  let offset = 0;

  while (true) {
    const { data, error: pageError } = await supabase
      .from("student_content_completions")
      .select("student_id, content_item_id, completed_at")
      .in("content_item_id", contentItemIds)
      .range(offset, offset + PAGE_SIZE - 1);

    if (pageError) {
      console.error("Error fetching completions:", pageError);
      throw pageError;
    }

    allCompletions.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // Create a set of completion keys for quick lookup
  const completionMap = new Map<string, string>();
  for (const c of allCompletions) {
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

export interface StudentContentCompletionForStudent {
  contentItemId: string;
  contentName: string;
  contentType: ContentItemType;
  isComplete: boolean;
  completedAt: string | null;
  requireTeacherUnlock: boolean;
  /** Ordering for rendering (matches `content_items.position`). */
  position: number;
  /** Public route segment for teacher URLs (assignment_id, quiz_id, etc.). */
  routeEntityId: string;
  /** Content placement group for `groupId` query param; null for class-level feed. */
  placementGroupId: string | null;
  /** Formative assignments only: submission feedback awaiting teacher approval. */
  hasPendingApproval: boolean;
}

/**
 * Get completion status for a single student (teacher view).
 *
 * Unlike `getClassContentCompletions`, this fetches completion rows for exactly
 * one student and scopes the returned content items to the student's assigned
 * group (class-level content if `studentGroupId` is null).
 */
export async function getClassStudentContentCompletions(params: {
  classDbId: string;
  studentId: string;
  studentGroupId: string | null;
}): Promise<StudentContentCompletionForStudent[]> {
  const { classDbId, studentId, studentGroupId } = params;
  const supabase = createClient();

  const contentItems = await getContentItemsByClass(classDbId);
  if (contentItems.length === 0) return [];

  const scopedContentItems = contentItems.filter((ci) => {
    if (studentGroupId === null) return ci.class_group_id === null || ci.class_group_id === undefined;
    return ci.class_group_id === studentGroupId;
  });

  if (scopedContentItems.length === 0) return [];

  // Collect ref_ids for content names (only for the scoped content items).
  const learningContentIds: string[] = [];
  const assignmentIds: string[] = [];
  const quizIds: string[] = [];
  const surveyIds: string[] = [];

  for (const item of scopedContentItems) {
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

  const [learningContents, assignments, quizzes, surveys] = await Promise.all([
    learningContentIds.length > 0
      ? getLearningContentsByIds(learningContentIds)
      : Promise.resolve([]),
    assignmentIds.length > 0
      ? getAssignmentsByIdsForTeacher(assignmentIds)
      : Promise.resolve([]),
    quizIds.length > 0 ? getQuizzesByIds(quizIds) : Promise.resolve([]),
    surveyIds.length > 0 ? getSurveysByIds(surveyIds) : Promise.resolve([]),
  ]);

  const contentNameMap = new Map<string, string>();
  const routeEntityByRefId = new Map<string, string>();

  for (const lc of learningContents) {
    contentNameMap.set(lc.id, lc.title);
    routeEntityByRefId.set(lc.id, lc.learning_content_id);
  }
  for (const a of assignments) {
    contentNameMap.set(a.id, a.title);
    routeEntityByRefId.set(a.id, a.assignment_id);
  }
  for (const q of quizzes) {
    contentNameMap.set(q.id, q.title);
    routeEntityByRefId.set(q.id, q.quiz_id);
  }
  for (const s of surveys) {
    contentNameMap.set(s.id, s.title);
    routeEntityByRefId.set(s.id, s.survey_id);
  }

  const contentItemIds = scopedContentItems.map((ci) => ci.id);

  // `submissions.assignment_id` stores `assignments.assignment_id` (short id),
  // not `assignments.id` / `content_items.ref_id` (uuid).
  const submissionAssignmentPublicIds = assignments.map((a) => a.assignment_id);

  const pendingAssignmentPublicIdsPromise =
    submissionAssignmentPublicIds.length === 0
      ? Promise.resolve(new Set<string>())
      : supabase
          .from("submissions")
          .select("assignment_id")
          .eq("student_id", studentId)
          .eq("has_attempts", true)
          .is("feedback_released_at", null)
          .or("is_preview.is.null,is_preview.eq.false")
          .in("assignment_id", submissionAssignmentPublicIds)
          .then(({ data, error }) => {
            if (error) throw error;
            const set = new Set<string>();
            for (const row of data ?? []) {
              const aid = row.assignment_id as string | null | undefined;
              if (aid) set.add(aid);
            }
            return set;
          });

  const [completionsResult, pendingAssignmentPublicIds] = await Promise.all([
    supabase
      .from("student_content_completions")
      .select("content_item_id, completed_at")
      .eq("student_id", studentId)
      .in("content_item_id", contentItemIds),
    pendingAssignmentPublicIdsPromise,
  ]);

  const { data: completionsData, error: completionsError } = completionsResult;

  if (completionsError) {
    console.error("Error fetching completions:", completionsError);
    throw completionsError;
  }

  const completionMap = new Map<string, string | null>();
  for (const c of completionsData || []) {
    completionMap.set(c.content_item_id, c.completed_at ?? null);
  }

  const result: StudentContentCompletionForStudent[] = scopedContentItems.map(
    (contentItem) => {
      const completedAt = completionMap.get(contentItem.id) ?? null;
      const routeEntityId =
        routeEntityByRefId.get(contentItem.ref_id) ?? "";
      const hasPendingApproval =
        contentItem.type === "formative_assignment" &&
        !!routeEntityId &&
        pendingAssignmentPublicIds.has(routeEntityId);
      return {
        contentItemId: contentItem.id,
        contentName: contentNameMap.get(contentItem.ref_id) || "Unknown",
        contentType: contentItem.type as ContentItemType,
        isComplete: !!completedAt,
        completedAt,
        requireTeacherUnlock: !!contentItem.require_teacher_unlock,
        position: contentItem.position,
        routeEntityId,
        placementGroupId: contentItem.class_group_id ?? null,
        hasPendingApproval,
      };
    }
  );

  return result.sort((a, b) => a.position - b.position);
}

/**
 * Reset all content completion progress for a student in a specific class.
 * Deletes completion marks, quiz submissions, and survey responses so the student
 * can redo content from scratch.
 */
export async function resetStudentProgress(
  classId: string,
  studentId: string
): Promise<void> {
  const supabase = createClient();

  // Get all content items in this class (need type and ref_id to reset quiz/survey data)
  const { data: contentItems, error: fetchError } = await supabase
    .from("content_items")
    .select("id, type, ref_id")
    .eq("class_id", classId)
    .in("status", ["active", "draft"]);

  if (fetchError) {
    console.error("Error fetching content items:", fetchError);
    throw fetchError;
  }

  if (!contentItems || contentItems.length === 0) {
    return;
  }

  const contentItemIds = contentItems.map((item) => item.id);

  // 1. Delete all completion marks for this student in this class (learning content, quiz, survey, assignment)
  const { error: deleteError } = await supabase
    .from("student_content_completions")
    .delete()
    .eq("student_id", studentId)
    .in("content_item_id", contentItemIds);

  if (deleteError) {
    console.error("Error resetting student progress:", deleteError);
    throw deleteError;
  }

  // 2. Delete quiz submissions and survey responses for this student (ref_id = quiz/survey UUID)
  const itemsWithRef = contentItems as { id: string; type: string; ref_id: string }[];
  for (const item of itemsWithRef) {
    const { ref_id: refId, type } = item;
    if (!refId || !type) continue;

    try {
      if (type === "quiz") {
        await deleteQuizSubmissionForStudent({
          quizId: refId,
          studentId,
        });
      } else if (type === "survey") {
        await deleteSurveyResponseForStudent({
          surveyId: refId,
          studentId,
        });
      } else if (type === "formative_assignment") {
        const submission = await getSubmissionByStudentAndAssignment(
          studentId,
          refId
        );
        if (submission) {
          await markAttemptsAsStale(submission.submission_id);
        }
      }
    } catch (err) {
      console.error(
        `Error resetting ${type} data for student (ref_id=${refId}):`,
        err
      );
      throw err;
    }
  }
}
