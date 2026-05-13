import { createClient } from "@/lib/supabase";
import { ClassTeacher, type ClassTeacherRole } from "@/types/class";

export interface ClassTeacherWithUserInfo extends ClassTeacher {
  teacher_email?: string;
  teacher_display_name?: string;
}

export async function listClassTeachers(classDbId: string): Promise<ClassTeacherWithUserInfo[]> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase.rpc("get_class_teachers_with_user_info", {
      p_class_id: classDbId,
    });

    if (!error && data) {
      return data as ClassTeacherWithUserInfo[];
    }
  } catch {
    console.log("Database function not available, using basic query");
  }

  const { data, error } = await supabase
    .from("class_teachers")
    .select("id, class_id, teacher_id, role, joined_at")
    .eq("class_id", classDbId)
    .order("joined_at", { ascending: true });

  if (error) throw error;
  return (data || []) as ClassTeacherWithUserInfo[];
}

export async function getMyClassTeacherRole(params: {
  classDbId: string;
  teacherId: string;
}): Promise<ClassTeacherRole | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("class_teachers")
    .select("role")
    .eq("class_id", params.classDbId)
    .eq("teacher_id", params.teacherId)
    .maybeSingle();

  if (error) throw error;
  const r = data?.role;
  if (
    r === "owner" ||
    r === "co-owner" ||
    r === "admin" ||
    r === "co-teacher"
  ) {
    return r;
  }
  return null;
}

/**
 * Returns true when the user has any `class_teachers` row for the class
 * (owner, co-owner, admin, or co-teacher).
 */
export async function isCoTeacherForClass(params: {
  classDbId: string;
  teacherId: string;
}): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("class_teachers")
    .select("id")
    .eq("class_id", params.classDbId)
    .eq("teacher_id", params.teacherId)
    .maybeSingle();

  if (error) {
    return false;
  }
  return data !== null;
}

export async function updateClassTeacherRole(params: {
  classDbId: string;
  teacherId: string;
  role: ClassTeacherRole;
}): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("class_teachers")
    .update({ role: params.role })
    .eq("class_id", params.classDbId)
    .eq("teacher_id", params.teacherId)
    .neq("role", "owner");

  if (error) throw error;
}

export async function removeCoTeacher(params: {
  classDbId: string;
  teacherId: string;
}): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("class_teachers")
    .delete()
    .eq("class_id", params.classDbId)
    .eq("teacher_id", params.teacherId)
    .neq("role", "owner");

  if (error) throw error;
}
