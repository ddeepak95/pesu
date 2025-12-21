import { createClient } from "@/lib/supabase";
import { ClassTeacher } from "@/types/class";

export async function listClassTeachers(classDbId: string): Promise<ClassTeacher[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("class_teachers")
    .select("*")
    .eq("class_id", classDbId)
    .order("joined_at", { ascending: true });

  if (error) throw error;
  return (data || []) as ClassTeacher[];
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

