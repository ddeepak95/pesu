import useSWR from "swr";
import {
  getClassGroups,
  getStudentGroupForClass,
  ClassGroup,
} from "@/lib/queries/groups";

/**
 * Fetch all groups for a class
 */
export function useClassGroups(classDbId: string | null) {
  return useSWR<ClassGroup[]>(
    classDbId ? ["classGroups", classDbId] : null,
    () => getClassGroups(classDbId!)
  );
}

/**
 * Fetch the group a student belongs to in a class
 */
export function useStudentGroupForClass(
  classDbId: string | null,
  studentId: string | null
) {
  return useSWR<string | null>(
    classDbId && studentId
      ? ["studentGroup", classDbId, studentId]
      : null,
    () => getStudentGroupForClass(classDbId!, studentId!)
  );
}
