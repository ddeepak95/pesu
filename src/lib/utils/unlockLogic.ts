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
  /** Days remaining until unlock (when locked due to day-delay) */
  daysRemaining?: number;
}

/** Compute calendar days between two dates (UTC date truncation). */
function daysBetweenUtc(earlier: string, later: Date): number {
  const a = new Date(earlier);
  const aDate = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bDate = Date.UTC(
    later.getUTCFullYear(),
    later.getUTCMonth(),
    later.getUTCDate()
  );
  return Math.floor((bDate - aDate) / (24 * 60 * 60 * 1000));
}

/** Check if item B is unlocked given previous item A's completion date and B's day-delay. */
function passesDayDelay(
  previousCompletedAt: string | undefined,
  unlockDaysAfterPrevious: number,
  now: Date = new Date()
): { passed: boolean; daysRemaining: number } {
  // Missing completed_at: treat as 0 days ago (unlock immediately) to avoid blocking students
  if (!previousCompletedAt) {
    return { passed: true, daysRemaining: 0 };
  }
  const daysElapsed = daysBetweenUtc(previousCompletedAt, now);
  if (daysElapsed >= unlockDaysAfterPrevious) {
    return { passed: true, daysRemaining: 0 };
  }
  return {
    passed: false,
    daysRemaining: unlockDaysAfterPrevious - daysElapsed,
  };
}

/**
 * Calculate unlock states for all content items based on progressive unlock,
 * teacher unlock rules, and per-item day-delay.
 *
 * Rules:
 * 1. If an item has require_teacher_unlock=true and hasn't been unlocked by
 *    the teacher for this student, it is teacher-locked (highest priority).
 * 2. If progressive unlock is disabled, all items are unlocked except:
 *    teacher-lock, lock-after-complete, and items with unlock_days_after_previous
 *    (which are gated by previous complete + X days).
 * 3. First item (position 0) is always unlocked initially.
 * 4. Subsequent items unlock when the previous item is complete (and day-delay
 *    is satisfied if set).
 * 5. Items with lock_after_complete=true become locked after being marked complete.
 *
 * Day-delay is independent of progressive unlock: items with unlock_days_after_previous > 0
 * are always gated by previous complete + X days.
 *
 * @param items - Array of content items (should be sorted by position)
 * @param completedAtByItemId - Map of content item ID -> ISO completed_at
 * @param progressiveUnlockEnabled - Whether progressive unlock is enabled for the class
 * @param teacherUnlockedIds - Set of content item IDs that have been unlocked by the teacher for this student
 * @returns Map of content item ID to its unlock state
 */
export function calculateUnlockStates(
  items: ContentItem[],
  completedAtByItemId: Map<string, string>,
  progressiveUnlockEnabled: boolean,
  teacherUnlockedIds: Set<string> = new Set()
): Map<string, UnlockState> {
  const unlockStates = new Map<string, UnlockState>();
  const completedIds = new Set(completedAtByItemId.keys());
  const now = new Date();

  // Helper to check teacher lock
  const isTeacherLocked = (item: ContentItem): boolean => {
    return (
      (item.require_teacher_unlock ?? false) &&
      !teacherUnlockedIds.has(item.id)
    );
  };

  // Sort items by position for day-delay checks
  const sortedItems = [...items].sort((a, b) => a.position - b.position);

  // If progressive unlock is disabled: all items unlocked except teacher-lock,
  // lock-after-complete, and items with unlock_days_after_previous > 0
  if (!progressiveUnlockEnabled) {
    for (let i = 0; i < sortedItems.length; i++) {
      const item = sortedItems[i];

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
      const isLockedAfterComplete =
        isComplete && (item.lock_after_complete ?? false);

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

      // Day-delay: items with unlock_days_after_previous > 0 are gated
      const daysRequired = item.unlock_days_after_previous ?? 0;
      if (daysRequired > 0 && i > 0) {
        const previousItem = sortedItems[i - 1];
        const isPreviousComplete = completedIds.has(previousItem.id);
        if (!isPreviousComplete) {
          unlockStates.set(item.id, {
            isUnlocked: false,
            isLocked: true,
            isLockedAfterComplete: false,
            isTeacherLocked: false,
            lockReason: "Complete the previous item to unlock this content",
          });
          continue;
        }
        const previousCompletedAt = completedAtByItemId.get(previousItem.id);
        const { passed, daysRemaining } = passesDayDelay(
          previousCompletedAt,
          daysRequired,
          now
        );

        if (!passed) {
          const reason =
            previousCompletedAt
              ? `This content unlocks ${daysRequired} days after completing the previous item. Available in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.`
              : "Complete the previous item to unlock this content.";
          unlockStates.set(item.id, {
            isUnlocked: false,
            isLocked: true,
            isLockedAfterComplete: false,
            isTeacherLocked: false,
            lockReason: reason,
            daysRemaining,
          });
          continue;
        }
      }

      unlockStates.set(item.id, {
        isUnlocked: true,
        isLocked: false,
        isLockedAfterComplete: false,
        isTeacherLocked: false,
        lockReason: null,
      });
    }
    return unlockStates;
  }

  // Progressive unlock enabled
  for (let i = 0; i < sortedItems.length; i++) {
    const item = sortedItems[i];

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
    const isLockedAfterComplete =
      isComplete && (item.lock_after_complete ?? false);

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

    const previousItem = sortedItems[i - 1];
    const isPreviousComplete = completedIds.has(previousItem.id);
    const previousCompletedAt = completedAtByItemId.get(previousItem.id);

    const daysRequired = item.unlock_days_after_previous ?? 0;

    if (!isPreviousComplete) {
      unlockStates.set(item.id, {
        isUnlocked: false,
        isLocked: true,
        isLockedAfterComplete: false,
        isTeacherLocked: false,
        lockReason: "Complete the previous item to unlock this content",
      });
      continue;
    }

    // Previous is complete; check day-delay if applicable
    if (daysRequired > 0) {
      const { passed, daysRemaining } = passesDayDelay(
        previousCompletedAt,
        daysRequired,
        now
      );
      if (!passed) {
        unlockStates.set(item.id, {
          isUnlocked: false,
          isLocked: true,
          isLockedAfterComplete: false,
          isTeacherLocked: false,
          lockReason: `This content unlocks ${daysRequired} days after completing the previous item. Available in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.`,
          daysRemaining,
        });
        continue;
      }
    }

    unlockStates.set(item.id, {
      isUnlocked: true,
      isLocked: false,
      isLockedAfterComplete: false,
      isTeacherLocked: false,
      lockReason: null,
    });
  }

  return unlockStates;
}

/**
 * Get the unlock state for a single content item
 */
export function getUnlockState(
  itemId: string,
  items: ContentItem[],
  completedAtByItemId: Map<string, string>,
  progressiveUnlockEnabled: boolean,
  teacherUnlockedIds: Set<string> = new Set()
): UnlockState | null {
  const allStates = calculateUnlockStates(
    items,
    completedAtByItemId,
    progressiveUnlockEnabled,
    teacherUnlockedIds
  );
  return allStates.get(itemId) ?? null;
}
