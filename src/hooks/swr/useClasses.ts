import useSWR from "swr";
import {
  getClassByClassId,
  getClassesByUser,
  getClassesByStudent,
  getProgressViewConfig,
} from "@/lib/queries/classes";
import { Class, ProgressViewConfig } from "@/types/class";

/**
 * Fetch a single class by its short class_id
 */
export function useClassData(classId: string | null) {
  return useSWR<Class | null>(
    classId ? ["class", classId] : null,
    () => getClassByClassId(classId!)
  );
}

/**
 * Fetch all classes for a teacher (owned + co-teaching)
 */
export function useClassesByUser(userId: string | null) {
  return useSWR<Class[]>(
    userId ? ["classesByUser", userId] : null,
    () => getClassesByUser(userId!)
  );
}

/**
 * Fetch all classes a student is enrolled in
 */
export function useClassesByStudent(studentId: string | null) {
  return useSWR<Class[]>(
    studentId ? ["classesByStudent", studentId] : null,
    () => getClassesByStudent(studentId!)
  );
}

/**
 * Fetch the saved progress-view config for a class.
 */
export function useProgressViewConfig(classDbId: string | null) {
  return useSWR<ProgressViewConfig | null>(
    classDbId ? ["progressViewConfig", classDbId] : null,
    () => getProgressViewConfig(classDbId!)
  );
}
