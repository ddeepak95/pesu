import { createClient } from "@/lib/supabase";

export interface ClassGroup {
  id: string;
  class_id: string;
  group_index: number;
  name: string | null;
  created_at: string;
  updated_at: string;
}

export async function getClassGroups(classDbId: string): Promise<ClassGroup[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("class_groups")
    .select("*")
    .eq("class_id", classDbId)
    .order("group_index", { ascending: true });

  if (error) throw error;
  return (data || []) as ClassGroup[];
}

export async function reconfigureClassGroups(params: {
  classDbId: string;
  newGroupCount: number;
}): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.rpc("reconfigure_class_groups", {
    p_class_id: params.classDbId,
    p_new_group_count: params.newGroupCount,
  });

  if (error) throw error;
}

/**
 * Get the group ID for a student in a specific class
 * Returns the group ID or null if student is not enrolled or not assigned to a group
 */
export async function getStudentGroupForClass(
  classDbId: string,
  studentId: string
): Promise<string | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("class_group_memberships")
    .select("group_id")
    .eq("class_id", classDbId)
    .eq("student_id", studentId)
    .single();

  if (error) {
    // If no membership found, return null (not an error)
    if (error.code === "PGRST116") {
      return null;
    }
    throw error;
  }

  return (data as { group_id: string })?.group_id ?? null;
}





