import useSWR, { mutate } from "swr";
import {
  ClassTeacherInvite,
  listTeacherInvites,
} from "@/lib/queries/teacherInvites";

/**
 * Fetch the teacher-invite rows for a class (most-recent first).
 */
export function useTeacherInvites(classDbId: string | null) {
  return useSWR<ClassTeacherInvite[]>(
    classDbId ? ["teacherInvites", classDbId] : null,
    () => listTeacherInvites(classDbId!)
  );
}

/**
 * Invalidate every cached teacher-invite list (call after create/revoke).
 */
export function invalidateTeacherInvitesCache() {
  return mutate(
    (key) =>
      Array.isArray(key) &&
      typeof key[0] === "string" &&
      key[0] === "teacherInvites"
  );
}
