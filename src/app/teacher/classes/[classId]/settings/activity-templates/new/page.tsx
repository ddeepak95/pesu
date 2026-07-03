import { notFound } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import { ClassTemplateEditor } from "@/components/Teacher/Classes/Settings/ClassTemplateEditor";
import { verifySession } from "@/lib/dal";

export const metadata = {
  title: "Create Activity Type",
};

/** Create a new class-owned activity template. Any co-teacher may create. */
export default async function NewClassTemplatePage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const { user, supabase } = await verifySession("/teacher/login");

  const { data: classData } = await supabase
    .from("classes")
    .select("id")
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
    <PageLayout>
      <ClassTemplateEditor classDbId={classData.id} classShortId={classId} />
    </PageLayout>
  );
}
