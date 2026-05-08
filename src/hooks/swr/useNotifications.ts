import useSWR, { mutate } from "swr";
import {
  getStudentNotifications,
  StudentNotification,
} from "@/lib/queries/notifications";

/**
 * Fetch all notifications for a student.
 */
export function useStudentNotifications(studentId: string | null) {
  return useSWR<StudentNotification[]>(
    studentId ? ["studentNotifications", studentId] : null,
    () => getStudentNotifications(studentId!)
  );
}

/**
 * Invalidate every cached student-notifications query (call after read/mark
 * mutations so the bell badge stays in sync).
 */
export function invalidateStudentNotificationsCache() {
  return mutate(
    (key) =>
      Array.isArray(key) &&
      typeof key[0] === "string" &&
      key[0] === "studentNotifications"
  );
}
