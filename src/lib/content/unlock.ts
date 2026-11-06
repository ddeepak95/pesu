import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContentItem } from "@/types/contentItem";
import { getUnlockState } from "@/lib/utils/unlockLogic";

const CONTENT_ITEM_COLUMNS =
  "id, content_item_id, class_id, class_group_id, type, ref_id, position, due_at, created_by, created_at, updated_at, status, lock_after_complete, require_teacher_unlock, unlock_days_after_previous";

const CLASS_COLUMNS =
  "id, name, class_id, created_by, created_at, updated_at, status, preferred_language, group_count, enable_progressive_unlock, student_assignment_strategy";

export interface ContentUnlockResult {
  contentItemId: string | null;
  isLocked: boolean;
  lockReason: string | null;
  classUuid: string | null;
  isComplete: boolean;
  /** When locked, the previous item in the student's content sequence (if any). */
  previousItem: { refId: string; type: ContentItem["type"] } | null;
  /** When true, item is locked because it was completed and lock_after_complete is set (hide "Go to previous item"). */
  isLockedAfterComplete?: boolean;
}

/**
 * Server-side helper that resolves the content-item, class UUID, and
 * progressive-unlock state for a student detail page.
 *
 * Runs entirely with the server Supabase client so it can be called from
 * Server Components without leaking browser-client code.
 */
export async function getContentUnlockState(
  supabase: SupabaseClient,
  userId: string,
  classId: string,
  refId: string,
  type: ContentItem["type"],
  placementId?: string,
  failClosed = false,
): Promise<ContentUnlockResult> {
  const result: ContentUnlockResult = {
    contentItemId: null,
    isLocked: true,
    lockReason: "This content is unavailable for your class or group",
    classUuid: null,
    isComplete: false,
    previousItem: null,
  };
  const unavailable = () => {
    if (failClosed) throw new Error(result.lockReason!);
    return result;
  };

  const { data: classData, error: classError } = await supabase
    .from("classes")
    .select(CLASS_COLUMNS)
    .eq("class_id", classId)
    .eq("status", "active")
    .maybeSingle();
  if (classError) throw classError;
  if (!classData) return unavailable();
  result.classUuid = classData.id;

  const { data: membership, error: membershipError } = await supabase
    .from("class_group_memberships")
    .select("group_id")
    .eq("class_id", classData.id)
    .eq("student_id", userId)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership?.group_id) return unavailable();

  // A ref may be placed in multiple groups. Resolve only this student's placement.
  let placementQuery = supabase
    .from("content_items")
    .select(CONTENT_ITEM_COLUMNS)
    .eq("class_id", classData.id)
    .eq("class_group_id", membership.group_id)
    .eq("ref_id", refId)
    .eq("type", type)
    .eq("status", "active");
  if (placementId) placementQuery = placementQuery.eq("id", placementId);
  const { data: contentItem, error: placementError } = await placementQuery.maybeSingle();
  if (placementError) throw placementError;
  if (!contentItem) return unavailable();
  result.contentItemId = contentItem.id;

  // Match the active sequence used by the class list and Next Item navigation.
  const { data: allItems, error: itemsError } = await supabase
    .from("content_items")
    .select(CONTENT_ITEM_COLUMNS)
    .eq("class_id", classData.id)
    .eq("class_group_id", membership.group_id)
    .eq("status", "active")
    .order("position", { ascending: true });
  if (itemsError) throw itemsError;
  if (!allItems?.some((item) => item.id === contentItem.id)) return unavailable();

  const itemIds = allItems.map((item: ContentItem) => item.id);
  const [completionResult, teacherUnlockResult] = await Promise.all([
    supabase.from("student_content_completions")
      .select("content_item_id, completed_at")
      .eq("student_id", userId)
      .in("content_item_id", itemIds),
    supabase.from("teacher_content_unlocks")
      .select("content_item_id")
      .eq("student_id", userId)
      .in("content_item_id", itemIds),
  ]);
  if (completionResult.error) throw completionResult.error;
  if (teacherUnlockResult.error) throw teacherUnlockResult.error;
  const completedAtByItemId = new Map<string, string>();
  for (const row of completionResult.data ?? []) {
    if (row.completed_at) completedAtByItemId.set(row.content_item_id, row.completed_at);
  }
  const teacherUnlockedIds = new Set<string>(
    (teacherUnlockResult.data ?? []).map((row) => row.content_item_id),
  );
  result.isComplete = completedAtByItemId.has(contentItem.id);
  const unlockState = getUnlockState(
    contentItem.id,
    allItems as ContentItem[],
    completedAtByItemId,
    classData.enable_progressive_unlock ?? false,
    teacherUnlockedIds,
  );
  if (!unlockState) return unavailable();
  result.isLocked = unlockState.isLocked;
  result.lockReason = unlockState.lockReason;
  result.isLockedAfterComplete = unlockState.isLockedAfterComplete;
  if (unlockState.isLocked && !unlockState.isTeacherLocked) {
    const index = allItems.findIndex((item) => item.id === contentItem.id);
    if (index > 0) {
      const previous = allItems[index - 1];
      result.previousItem = { refId: previous.ref_id, type: previous.type };
    }
  }
  return result;
}
