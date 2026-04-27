import useSWR, { mutate } from "swr";
import {
  ClassTeacherWithUserInfo,
  isCoTeacherForClass,
  listClassTeachers,
} from "@/lib/queries/classTeachers";

/**
 * Invalidate every cached class-teachers query (call after add/remove).
 */
export function invalidateClassTeachersCache() {
  return mutate(
    (key) =>
      Array.isArray(key) &&
      typeof key[0] === "string" &&
      (key[0] === "classTeachers" || key[0] === "isCoTeacherForClass")
  );
}

/**
 * Fetch all teachers (owner + co-teachers) for a class.
 */
export function useClassTeachers(classDbId: string | null) {
  return useSWR<ClassTeacherWithUserInfo[]>(
    classDbId ? ["classTeachers", classDbId] : null,
    () => listClassTeachers(classDbId!)
  );
}

/**
 * Returns whether the given user is a co-teacher for the class. Returns
 * `false` until the fetch resolves; combine with an owner check in the
 * caller.
 */
export function useIsCoTeacherForClass(
  classDbId: string | null,
  teacherId: string | null
) {
  return useSWR<boolean>(
    classDbId && teacherId
      ? ["isCoTeacherForClass", classDbId, teacherId]
      : null,
    () =>
      isCoTeacherForClass({
        classDbId: classDbId!,
        teacherId: teacherId!,
      })
  );
}
