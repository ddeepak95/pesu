import useSWR from "swr";
import {
  getAssignmentByIdForTeacher,
  getAssignmentsByClassForTeacher,
  getAssignmentsByIds,
  getAssignmentsByIdsForTeacher,
} from "@/lib/queries/assignments";
import { Assignment } from "@/types/assignment";

/**
 * Fetch assignments by their database UUIDs (student view — active only)
 */
export function useAssignmentsByIds(ids: string[]) {
  // Stable key: sort ids so the cache key is order-independent
  const sortedKey = ids.length > 0 ? [...ids].sort().join(",") : null;
  return useSWR<Assignment[]>(
    sortedKey ? ["assignmentsByIds", sortedKey] : null,
    () => getAssignmentsByIds(ids)
  );
}

/**
 * Fetch assignments by their database UUIDs (teacher view — active + draft)
 */
export function useAssignmentsByIdsForTeacher(ids: string[]) {
  const sortedKey = ids.length > 0 ? [...ids].sort().join(",") : null;
  return useSWR<Assignment[]>(
    sortedKey ? ["assignmentsByIdsTeacher", sortedKey] : null,
    () => getAssignmentsByIdsForTeacher(ids)
  );
}

/**
 * Fetch a single assignment by its public assignment_id (teacher view).
 */
export function useAssignmentByIdForTeacher(assignmentId: string | null) {
  return useSWR<Assignment | null>(
    assignmentId ? ["assignmentByIdTeacher", assignmentId] : null,
    () => getAssignmentByIdForTeacher(assignmentId!)
  );
}

/**
 * Fetch all assignments for a class (teacher view — includes drafts).
 */
export function useAssignmentsByClassForTeacher(classId: string | null) {
  return useSWR<Assignment[]>(
    classId ? ["assignmentsByClassTeacher", classId] : null,
    () => getAssignmentsByClassForTeacher(classId!)
  );
}
