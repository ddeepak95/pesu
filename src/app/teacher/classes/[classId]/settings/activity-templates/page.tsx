import { notFound } from "next/navigation";

import ManageActivityTemplates from "@/components/Teacher/Classes/Settings/ManageActivityTemplates";
import { verifySession } from "@/lib/dal";

export const metadata = {
  title: "Manage Activity Templates",
};

/**
 * Dedicated surface (reached from the class settings "Activity Types" summary)
 * for managing which activity types are available in a class: curating system
 * types, creating class-owned types, and adding types from other libraries.
 * Any co-teacher of the class may manage its templates (RLS enforces writes).
 */
export default async function ManageActivityTemplatesPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const { user, supabase } = await verifySession("/teacher/login");

  const { data: classData } = await supabase
    .from("classes")
    .select("id, name")
    .eq("class_id", classId)
    .in("status", ["active", "archived"])
    .single();
  if (!classData) notFound();

  const { data: membership } = await supabase
    .from("class_teachers")
    .select("teacher_id")
    .eq("class_id", classData.id)
    .eq("teacher_id", user.id)
    .maybeSingle();
  if (!membership) notFound();

  return (
    <ManageActivityTemplates
      classDbId={classData.id}
      classShortId={classId}
      classDisplayName={classData.name}
      userId={user.id}
    />
  );
}
