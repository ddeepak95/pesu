import useSWR, { mutate } from "swr";
import {
  getClassContentCompletions,
  getClassStudentContentCompletions,
  getClassStudentProgressSummary,
  getCompletionsByContentItem,
  isContentComplete,
  StudentContentCompletionForStudent,
  ClassStudentProgressSummaryRow,
} from "@/lib/queries/contentCompletions";
import { StudentContentCompletionWithDetails } from "@/types/contentCompletion";

/**
 * Fetch every student/content-item completion in a class. Optionally gated by
 * `enabled` so the heavy fetch can be deferred until a tab becomes visible.
 */
export function useClassContentCompletions(
  classDbId: string | null,
  enabled: boolean = true
) {
  return useSWR<StudentContentCompletionWithDetails[]>(
    enabled && classDbId ? ["classContentCompletions", classDbId] : null,
    () => getClassContentCompletions(classDbId!)
  );
}

/**
 * Lightweight per-student progress aggregates (Progress / Analytics tab).
 * Prefer over `useClassContentCompletions` when cell-level rows are not needed.
 */
export function useClassStudentProgressSummary(
  classDbId: string | null,
  enabled: boolean = true
) {
  return useSWR<ClassStudentProgressSummaryRow[]>(
    enabled && classDbId ? ["classStudentProgressSummary", classDbId] : null,
    () => getClassStudentProgressSummary(classDbId!)
  );
}

/**
 * Fetch every content item completion for one student in a class, scoped to
 * the student's assigned group.
 */
export function useClassStudentContentCompletions(params: {
  classDbId: string | null;
  studentId: string | null;
  studentGroupId: string | null;
}) {
  const { classDbId, studentId, studentGroupId } = params;
  return useSWR<StudentContentCompletionForStudent[]>(
    classDbId && studentId
      ? [
          "classStudentContentCompletions",
          classDbId,
          studentId,
          studentGroupId ?? "__none__",
        ]
      : null,
    () =>
      getClassStudentContentCompletions({
        classDbId: classDbId!,
        studentId: studentId!,
        studentGroupId,
      })
  );
}

/**
 * Whether the current student has completed a single content item.
 */
export function useIsContentComplete(contentItemId: string | null) {
  return useSWR<boolean>(
    contentItemId ? ["isContentComplete", contentItemId] : null,
    () => isContentComplete(contentItemId!)
  );
}

/**
 * Fetch the (student_id, completed_at) pairs for a single content item.
 */
export function useCompletionsByContentItem(contentItemId: string | null) {
  return useSWR<{ student_id: string; completed_at: string }[]>(
    contentItemId ? ["completionsByContentItem", contentItemId] : null,
    () => getCompletionsByContentItem(contentItemId!)
  );
}

/**
 * Invalidate every cached class-level content completion query (call after
 * teacher reset/unlock mutations to keep dialogs in sync).
 */
export function invalidateClassContentCompletionsCache() {
  return mutate(
    (key) =>
      Array.isArray(key) &&
      typeof key[0] === "string" &&
      (key[0] === "classContentCompletions" ||
        key[0] === "classStudentProgressSummary" ||
        key[0] === "classStudentContentCompletions" ||
        key[0] === "completionsByContentItem")
  );
}
