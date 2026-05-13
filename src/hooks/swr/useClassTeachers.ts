import useSWR, { mutate } from "swr";
import {
  ClassTeacherWithUserInfo,
  getMyClassTeacherRole,
  isCoTeacherForClass,
  listClassTeachers,
} from "@/lib/queries/classTeachers";
import type { ClassTeacherRole } from "@/types/class";

/**
 * Invalidate every cached class-teachers query (call after add/remove).
 */
export function invalidateClassTeachersCache() {
  return mutate(
    (key) =>
      Array.isArray(key) &&
      typeof key[0] === "string" &&
      (key[0] === "classTeachers" ||
        key[0] === "isCoTeacherForClass" ||
        key[0] === "myClassTeacherRole")
  );
}

/**
 * Fetch all teachers for a class (including primary owner as a row).
 */
export function useClassTeachers(classDbId: string | null) {
  return useSWR<ClassTeacherWithUserInfo[]>(
    classDbId ? ["classTeachers", classDbId] : null,
    () => listClassTeachers(classDbId!)
  );
}

/**
 * Current user's `class_teachers.role` for this class, or null if not on the roster.
 */
export function useMyClassTeacherRole(
  classDbId: string | null,
  teacherId: string | null
) {
  return useSWR<ClassTeacherRole | null>(
    classDbId && teacherId ? ["myClassTeacherRole", classDbId, teacherId] : null,
    () =>
      getMyClassTeacherRole({
        classDbId: classDbId!,
        teacherId: teacherId!,
      })
  );
}

/**
 * Returns whether the user has any `class_teachers` row for the class.
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
