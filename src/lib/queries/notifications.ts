import { createClient } from "@/lib/supabase";

export interface StudentNotification {
  id: string;
  student_id: string;
  type: string;
  title: string;
  message: string | null;
  data: {
    nav_path: string;
    assignment_title: string;
  };
  read_at: string | null;
  created_at: string;
}

/**
 * Fetch all notifications for a student, newest first.
 * Uses the browser Supabase client — RLS ensures only the student's own rows.
 */
export async function getStudentNotifications(
  studentId: string
): Promise<StudentNotification[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("student_notifications")
    .select("id, student_id, type, title, message, data, read_at, created_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error fetching notifications:", error);
    return [];
  }

  return (data ?? []) as StudentNotification[];
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationAsRead(
  notificationId: string
): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("student_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .is("read_at", null); // no-op if already read

  if (error) {
    console.error("Error marking notification as read:", error);
  }
}

/**
 * Mark all unread notifications for a student as read.
 */
export async function markAllNotificationsAsRead(
  studentId: string
): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("student_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("student_id", studentId)
    .is("read_at", null);

  if (error) {
    console.error("Error marking all notifications as read:", error);
  }
}
