import { ContentItem } from "@/types/contentItem";

/**
 * Represents the unlock state of a content item
 */
export interface UnlockState {
  /** Whether the content item is currently unlocked and accessible */
  isUnlocked: boolean;
  /** Whether the item is locked (inverse of isUnlocked, for convenience) */
  isLocked: boolean;
  /** Whether the item is locked because it was marked complete and has lock_after_complete=true */
  isLockedAfterComplete: boolean;
  /** Whether the item is locked because the teacher has not unlocked it for this student */
  isTeacherLocked: boolean;
  /** Human-readable reason why the item is locked (null if unlocked) */
  lockReason: string | null;
}

/**
 * Calculate unlock states for all content items based on progressive unlock
 * and teacher unlock rules.
 * 
 * Rules:
 * 1. If an item has require_teacher_unlock=true and hasn't been unlocked by
 *    the teacher for this student, it is teacher-locked (highest priority).
 * 2. If progressive unlock is disabled, all remaining items are unlocked
 *    (unless locked after complete).
 * 3. First item (position 0) is always unlocked initially.
 * 4. Subsequent items unlock when the previous item (by position) is marked complete.
 * 5. Items with lock_after_complete=true become locked after being marked complete.
 * 
 * @param items - Array of content items (should be sorted by position)
 * @param completedIds - Set of content item IDs that have been marked complete
 * @param progressiveUnlockEnabled - Whether progressive unlock is enabled for the class
 * @param teacherUnlockedIds - Set of content item IDs that have been unlocked by the teacher for this student
 * @returns Map of content item ID to its unlock state
 */
export function calculateUnlockStates(
  items: ContentItem[],
  completedIds: Set<string>,
  progressiveUnlockEnabled: boolean,
  teacherUnlockedIds: Set<string> = new Set()
): Map<string, UnlockState> {
  const unlockStates = new Map<string, UnlockState>();

  // Helper to check teacher lock
  const isTeacherLocked = (item: ContentItem): boolean => {
    return (
      (item.require_teacher_unlock ?? false) &&
      !teacherUnlockedIds.has(item.id)
    );
  };

  // If progressive unlock is disabled, all items are unlocked (unless locked after complete or teacher-locked)
  if (!progressiveUnlockEnabled) {
    for (const item of items) {
      // Check teacher lock first (highest priority)
      if (isTeacherLocked(item)) {
        unlockStates.set(item.id, {
          isUnlocked: false,
          isLocked: true,
          isLockedAfterComplete: false,
          isTeacherLocked: true,
          lockReason: "This content requires teacher approval to access",
        });
        continue;
      }

      const isComplete = completedIds.has(item.id);
      const isLockedAfterComplete = isComplete && (item.lock_after_complete ?? false);
      
      unlockStates.set(item.id, {
        isUnlocked: !isLockedAfterComplete,
        isLocked: isLockedAfterComplete,
        isLockedAfterComplete,
        isTeacherLocked: false,
        lockReason: isLockedAfterComplete 
          ? "This item is no longer accessible after completion" 
          : null,
      });
    }
    return unlockStates;
  }

  // Sort items by position to ensure correct ordering
  const sortedItems = [...items].sort((a, b) => a.position - b.position);

  // Calculate unlock state for each item
  for (let i = 0; i < sortedItems.length; i++) {
    const item = sortedItems[i];

    // Check teacher lock first (highest priority)
    if (isTeacherLocked(item)) {
      unlockStates.set(item.id, {
        isUnlocked: false,
        isLocked: true,
        isLockedAfterComplete: false,
        isTeacherLocked: true,
        lockReason: "This content requires teacher approval to access",
      });
      continue;
    }

    const isComplete = completedIds.has(item.id);
    const isLockedAfterComplete = isComplete && (item.lock_after_complete ?? false);

    // Check if this item is locked after complete
    if (isLockedAfterComplete) {
      unlockStates.set(item.id, {
        isUnlocked: false,
        isLocked: true,
        isLockedAfterComplete: true,
        isTeacherLocked: false,
        lockReason: "This item is no longer accessible after completion",
      });
      continue;
    }

    // First item is always unlocked
    if (i === 0) {
      unlockStates.set(item.id, {
        isUnlocked: true,
        isLocked: false,
        isLockedAfterComplete: false,
        isTeacherLocked: false,
        lockReason: null,
      });
      continue;
    }

    // For subsequent items, check if previous item is complete
    const previousItem = sortedItems[i - 1];
    const isPreviousComplete = completedIds.has(previousItem.id);

    if (isPreviousComplete) {
      // Previous item is complete, so this item is unlocked
      unlockStates.set(item.id, {
        isUnlocked: true,
        isLocked: false,
        isLockedAfterComplete: false,
        isTeacherLocked: false,
        lockReason: null,
      });
    } else {
      // Previous item is not complete, so this item is locked
      unlockStates.set(item.id, {
        isUnlocked: false,
        isLocked: true,
        isLockedAfterComplete: false,
        isTeacherLocked: false,
        lockReason: "Complete the previous item to unlock this content",
      });
    }
  }

  return unlockStates;
}

/**
 * Get the unlock state for a single content item
 * 
 * @param itemId - ID of the content item to check
 * @param items - Array of all content items
 * @param completedIds - Set of completed content item IDs
 * @param progressiveUnlockEnabled - Whether progressive unlock is enabled
 * @param teacherUnlockedIds - Set of content item IDs unlocked by the teacher for this student
 * @returns The unlock state for the specified item, or null if not found
 */
export function getUnlockState(
  itemId: string,
  items: ContentItem[],
  completedIds: Set<string>,
  progressiveUnlockEnabled: boolean,
  teacherUnlockedIds: Set<string> = new Set()
): UnlockState | null {
  const allStates = calculateUnlockStates(items, completedIds, progressiveUnlockEnabled, teacherUnlockedIds);
  return allStates.get(itemId) ?? null;
}
