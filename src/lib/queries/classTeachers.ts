import { createClient } from "@/lib/supabase";
import { ClassTeacher } from "@/types/class";

export interface ClassTeacherWithUserInfo extends ClassTeacher {
  teacher_email?: string;
  teacher_display_name?: string;
}

export async function listClassTeachers(classDbId: string): Promise<ClassTeacherWithUserInfo[]> {
  const supabase = createClient();

  // Try to get user info via a database function
  // If the function doesn't exist, fall back to basic query
  try {
    const { data, error } = await supabase.rpc('get_class_teachers_with_user_info', {
      p_class_id: classDbId
    });
    
    if (!error && data) {
      return data as ClassTeacherWithUserInfo[];
    }
  } catch {
    // Function doesn't exist, fall back to basic query
    console.log("Database function not available, using basic query");
  }

  // Fallback: basic query without user info
  const { data, error } = await supabase
    .from("class_teachers")
    .select("*")
    .eq("class_id", classDbId)
    .order("joined_at", { ascending: true });

  if (error) throw error;
  return (data || []) as ClassTeacherWithUserInfo[];
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
    .eq("role", "co-teacher");

  if (error) throw error;
}


