import useSWR from "swr";
import {
  StudentWithInfo,
  getClassStudentsWithInfo,
} from "@/lib/queries/students";

/**
 * Fetch all students enrolled in a class (with user info + group assignment).
 */
export function useClassStudents(classDbId: string | null) {
  return useSWR<StudentWithInfo[]>(
    classDbId ? ["classStudents", classDbId] : null,
    () => getClassStudentsWithInfo(classDbId!)
  );
}
