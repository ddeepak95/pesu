import useSWR, { mutate } from "swr";
import {
  getTeacherUnlocksForClass,
  getTeacherUnlocksForContentItem,
  getTeacherUnlocksForStudent,
  getTeacherUnlocksForStudentInClass,
} from "@/lib/queries/teacherUnlocks";
import { TeacherContentUnlock } from "@/types/contentItem";

/**
 * Fetch the set of teacher unlocks for a specific content item (one row per
 * unlocked student).
 */
export function useTeacherUnlocksForContentItem(contentItemId: string | null) {
  return useSWR<TeacherContentUnlock[]>(
    contentItemId ? ["teacherUnlocksForContentItem", contentItemId] : null,
    () => getTeacherUnlocksForContentItem(contentItemId!)
  );
}

/**
 * Fetch the set of teacher-unlocked content items for the current student
 * across the supplied content item IDs.
 */
export function useTeacherUnlocksForStudent(contentItemIds: string[]) {
  const sortedKey =
    contentItemIds.length > 0 ? [...contentItemIds].sort().join(",") : null;
  return useSWR<Set<string>>(
    sortedKey ? ["teacherUnlocksForStudent", sortedKey] : null,
    () => getTeacherUnlocksForStudent(contentItemIds),
    {
      compare: (a, b) => {
        if (a === b) return true;
        if (!a || !b || a.size !== b.size) return false;
        for (const item of a) if (!b.has(item)) return false;
        return true;
      },
    }
  );
}

/**
 * Fetch every teacher unlock for a class as a map keyed by
 * "contentItemId:studentId".
 */
export function useTeacherUnlocksForClass(classDbId: string | null) {
  return useSWR<Map<string, TeacherContentUnlock>>(
    classDbId ? ["teacherUnlocksForClass", classDbId] : null,
    () => getTeacherUnlocksForClass(classDbId!)
  );
}

/**
 * Fetch the unlocked content item IDs for a single student in a class,
 * restricted to the supplied list.
 */
export function useTeacherUnlocksForStudentInClass(params: {
  classDbId: string | null;
  studentId: string | null;
  contentItemIds: string[];
}) {
  const { classDbId, studentId, contentItemIds } = params;
  const sortedKey =
    contentItemIds.length > 0 ? [...contentItemIds].sort().join(",") : null;
  return useSWR<Set<string>>(
    classDbId && studentId && sortedKey
      ? ["teacherUnlocksForStudentInClass", classDbId, studentId, sortedKey]
      : null,
    () =>
      getTeacherUnlocksForStudentInClass({
        classDbId: classDbId!,
        studentId: studentId!,
        contentItemIds,
      }),
    {
      compare: (a, b) => {
        if (a === b) return true;
        if (!a || !b || a.size !== b.size) return false;
        for (const item of a) if (!b.has(item)) return false;
        return true;
      },
    }
  );
}

/**
 * Invalidate every cached teacher-unlock query (call after a mutation).
 */
export function invalidateTeacherUnlocksCache() {
  return mutate(
    (key) =>
      Array.isArray(key) &&
      typeof key[0] === "string" &&
      key[0].startsWith("teacherUnlocks")
  );
}
