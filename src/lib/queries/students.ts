import { createClient } from "@/lib/supabase";

export interface StudentWithInfo {
  student_id: string;
  joined_at: string;
  student_email: string | null;
  student_display_name: string | null;
  group_id: string | null;
  group_name: string | null;
  group_index: number | null;
}

/**
 * Get all students enrolled in a class with their user info and group assignment
 */
export async function getClassStudentsWithInfo(
  classDbId: string
): Promise<StudentWithInfo[]> {
  const supabase = createClient();

  try {
    // Try to use the database function if available
    const { data, error } = await supabase.rpc(
      "get_class_students_with_user_info",
      {
        p_class_id: classDbId,
      }
    );

    if (!error && data) {
      return data as StudentWithInfo[];
    }
  } catch {
    // Function doesn't exist, fall back to basic query
    console.log("Database function not available, using basic query");
  }

  // Fallback: basic query without user info
  const supabaseClient = createClient();
  const { data: studentData, error: studentError } = await supabaseClient
    .from("class_students")
    .select("student_id, joined_at")
    .eq("class_id", classDbId)
    .order("joined_at", { ascending: false });

  if (studentError) throw studentError;

  // Fetch group memberships
  const studentIds = (studentData || []).map((s) => s.student_id);
  const studentInfo: StudentWithInfo[] = [];

  if (studentIds.length > 0) {
    const { data: membershipData } = await supabaseClient
      .from("class_group_memberships")
      .select("student_id, group_id")
      .eq("class_id", classDbId)
      .in("student_id", studentIds);

    const membershipMap = new Map(
      (membershipData || []).map((m) => [m.student_id, m.group_id])
    );

    // Fetch group details
    const groupIds = Array.from(
      new Set(
        (membershipData || [])
          .map((m) => m.group_id)
          .filter((id): id is string => id !== null)
      )
    );

    let groupsMap = new Map<string, { name: string | null; group_index: number }>();
    if (groupIds.length > 0) {
      const { data: groupsData } = await supabaseClient
        .from("class_groups")
        .select("id, name, group_index")
        .in("id", groupIds);

      groupsMap = new Map(
        (groupsData || []).map((g) => [
          g.id,
          { name: g.name, group_index: g.group_index },
        ])
      );
    }

    for (const student of studentData || []) {
      const groupId = membershipMap.get(student.student_id) || null;
      const groupInfo = groupId ? groupsMap.get(groupId) : null;

      studentInfo.push({
        student_id: student.student_id,
        joined_at: student.joined_at,
        student_email: null,
        student_display_name: null,
        group_id: groupId,
        group_name: groupInfo?.name || null,
        group_index: groupInfo?.group_index ?? null,
      });
    }
  }

  return studentInfo;
}

/**
 * Reassign a student to a different group
 */
export async function reassignStudentToGroup(params: {
  classDbId: string;
  studentId: string;
  newGroupId: string;
}): Promise<void> {
  const supabase = createClient();

  // Use upsert since there's a UNIQUE constraint on (class_id, student_id)
  const { error: upsertError } = await supabase
    .from("class_group_memberships")
    .upsert(
      {
        class_id: params.classDbId,
        student_id: params.studentId,
        group_id: params.newGroupId,
      },
      {
        onConflict: "class_id,student_id",
      }
    );

  if (upsertError) throw upsertError;
}

