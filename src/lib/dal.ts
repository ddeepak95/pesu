import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ContentItem } from "@/types/contentItem";
import { getUnlockState } from "@/lib/utils/unlockLogic";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Verify the user's session. Memoized per request via React cache().
 *
 * Call this in Server Components, Server Actions, and Route Handlers.
 * Multiple calls within the same request only trigger one getUser() round-trip.
 *
 * Redirects to the provided loginPath if the user is not authenticated.
 */
export const verifySession = cache(
  async (loginPath = "/teacher/login") => {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect(loginPath);
    }

    return { user, supabase };
  }
);

// ---------------------------------------------------------------------------
// Shared server-side helper: content item + progressive unlock state
// ---------------------------------------------------------------------------

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
  classId: string, // short class_id from the URL
  refId: string, // entity UUID (assignments.id, quizzes.id, etc.)
  type: ContentItem["type"]
): Promise<ContentUnlockResult> {
  const result: ContentUnlockResult = {
    contentItemId: null,
    isLocked: false,
    lockReason: null,
    classUuid: null,
    isComplete: false,
    previousItem: null,
  };

  // 1. Fetch the content item by ref_id + type
  const { data: contentItem } = await supabase
    .from("content_items")
    .select(CONTENT_ITEM_COLUMNS)
    .eq("ref_id", refId)
    .eq("type", type)
    .in("status", ["active", "draft"])
    .maybeSingle();

  if (!contentItem) return result;

  result.contentItemId = contentItem.id;

  // 2. Check if already complete
  const { data: completionRow } = await supabase
    .from("student_content_completions")
    .select("id")
    .eq("student_id", userId)
    .eq("content_item_id", contentItem.id)
    .maybeSingle();

  result.isComplete = !!completionRow;

  // 3. Fetch class data
  const { data: classData } = await supabase
    .from("classes")
    .select(CLASS_COLUMNS)
    .eq("class_id", classId)
    .eq("status", "active")
    .single();

  if (classData) {
    result.classUuid = classData.id;
  }

  // 4. Check teacher unlock (require_teacher_unlock)
  // If the content item requires teacher unlock, check if it has been unlocked for this student
  if (contentItem.require_teacher_unlock) {
    const { data: teacherUnlock } = await supabase
      .from("teacher_content_unlocks")
      .select("id")
      .eq("content_item_id", contentItem.id)
      .eq("student_id", userId)
      .maybeSingle();

    if (!teacherUnlock) {
      result.isLocked = true;
      result.lockReason = "This content requires teacher approval to access";
      result.previousItem = null;
      return result;
    }
  }

  // 5. Check progressive unlock and day-delay (day-delay applies regardless of progressive unlock)
  if (classData) {
    try {
      // Get student's group
      const { data: membership } = await supabase
        .from("class_group_memberships")
        .select("group_id")
        .eq("class_id", classData.id)
        .eq("student_id", userId)
        .single();

      const groupId = membership?.group_id ?? null;

      if (groupId) {
        // Get all content items in the group
        const { data: allItems } = await supabase
          .from("content_items")
          .select(CONTENT_ITEM_COLUMNS)
          .eq("class_id", classData.id)
          .eq("class_group_id", groupId)
          .in("status", ["active", "draft"])
          .order("position", { ascending: true });

        if (allItems && allItems.length > 0) {
          const itemIds = allItems.map((i: ContentItem) => i.id);

          // Get completions with dates (needed for day-delay)
          const { data: completions } = await supabase
            .from("student_content_completions")
            .select("content_item_id, completed_at")
            .eq("student_id", userId)
            .in("content_item_id", itemIds);

          const completedAtByItemId = new Map<string, string>();
          for (const c of completions ?? []) {
            if (c.completed_at) {
              completedAtByItemId.set(c.content_item_id, c.completed_at);
            }
          }

          // Get teacher unlocks for all items in the group
          const { data: teacherUnlocks } = await supabase
            .from("teacher_content_unlocks")
            .select("content_item_id")
            .eq("student_id", userId)
            .in("content_item_id", itemIds);

          const teacherUnlockedIds = new Set(
            (teacherUnlocks ?? []).map(
              (u: { content_item_id: string }) => u.content_item_id
            )
          );

          const unlockState = getUnlockState(
            contentItem.id,
            allItems as ContentItem[],
            completedAtByItemId,
            classData.enable_progressive_unlock ?? false,
            teacherUnlockedIds
          );

          if (unlockState?.isLocked) {
            result.isLocked = true;
            result.lockReason = unlockState.lockReason;
            result.isLockedAfterComplete = unlockState.isLockedAfterComplete ?? false;
            const currentIndex = (allItems as ContentItem[]).findIndex(
              (i) => i.id === contentItem.id
            );
            if (currentIndex > 0) {
              const prev = (allItems as ContentItem[])[currentIndex - 1];
              result.previousItem = {
                refId: prev.ref_id,
                type: prev.type,
              };
            } else {
              result.previousItem = null;
            }
          }
        }
      }
    } catch (err) {
      console.error("Error checking unlock status:", err);
      // Don't block access if there's an error checking unlock status
    }
  }

  return result;
}

/** Map content item type to student URL path segment. */
const CONTENT_TYPE_SEGMENT: Record<ContentItem["type"], string> = {
  formative_assignment: "assignments",
  learning_content: "learning-content",
  quiz: "quizzes",
  survey: "surveys",
};

/**
 * Resolve the public id (assignment_id, learning_content_id, quiz_id, survey_id)
 * for a content item ref so the student URL can be built.
 */
export async function getPublicIdForContentRef(
  supabase: SupabaseClient,
  refId: string,
  type: ContentItem["type"]
): Promise<string | null> {
  if (type === "formative_assignment") {
    const { data } = await supabase
      .from("assignments")
      .select("assignment_id")
      .eq("id", refId)
      .maybeSingle();
    return data?.assignment_id ?? null;
  }
  if (type === "learning_content") {
    const { data } = await supabase
      .from("learning_contents")
      .select("learning_content_id")
      .eq("id", refId)
      .maybeSingle();
    return data?.learning_content_id ?? null;
  }
  if (type === "quiz") {
    const { data } = await supabase
      .from("quizzes")
      .select("quiz_id")
      .eq("id", refId)
      .maybeSingle();
    return data?.quiz_id ?? null;
  }
  if (type === "survey") {
    const { data } = await supabase
      .from("surveys")
      .select("survey_id")
      .eq("id", refId)
      .maybeSingle();
    return data?.survey_id ?? null;
  }
  return null;
}

/**
 * Build the full student URL for a content item (previous item link).
 * Returns null if the public id cannot be resolved.
 */
export async function buildContentItemUrl(
  supabase: SupabaseClient,
  classId: string,
  refId: string,
  type: ContentItem["type"]
): Promise<string | null> {
  const publicId = await getPublicIdForContentRef(supabase, refId, type);
  if (!publicId) return null;
  const segment = CONTENT_TYPE_SEGMENT[type];
  return `/student/classes/${classId}/${segment}/${publicId}`;
}
