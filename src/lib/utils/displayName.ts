/**
 * Centralized utility for computing student display names.
 *
 * The DB function `get_class_students_with_user_info` already resolves
 * profile-based display names into `student_display_name`, so this
 * utility simply applies the fallback chain:
 *   profile/auth display name -> email -> truncated UUID
 */
export function getStudentDisplayName(student: {
  student_display_name?: string | null;
  student_email?: string | null;
  student_id: string;
}): string {
  return (
    student.student_display_name ||
    student.student_email ||
    student.student_id.substring(0, 8) + "..."
  );
}
