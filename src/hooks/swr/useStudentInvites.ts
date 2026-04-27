import useSWR, { mutate } from "swr";
import {
  ClassStudentInvite,
  listStudentInvites,
} from "@/lib/queries/studentInvites";

/**
 * Fetch the student-invite rows for a class (most-recent first).
 */
export function useStudentInvites(classDbId: string | null) {
  return useSWR<ClassStudentInvite[]>(
    classDbId ? ["studentInvites", classDbId] : null,
    () => listStudentInvites(classDbId!)
  );
}

/**
 * Invalidate every cached student-invite list (call after create/revoke).
 */
export function invalidateStudentInvitesCache() {
  return mutate(
    (key) =>
      Array.isArray(key) &&
      typeof key[0] === "string" &&
      key[0] === "studentInvites"
  );
}
