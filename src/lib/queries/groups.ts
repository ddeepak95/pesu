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

