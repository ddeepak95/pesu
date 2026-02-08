import useSWR from "swr";
import {
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
