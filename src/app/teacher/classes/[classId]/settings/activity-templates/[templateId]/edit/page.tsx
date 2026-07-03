import { notFound } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import { ClassTemplateEditor } from "@/components/Teacher/Classes/Settings/ClassTemplateEditor";
import { verifySession } from "@/lib/dal";
import { getTemplateById } from "@/lib/queries/activityTemplates";

export const metadata = {
  title: "Edit Activity Type",
};

/**
 * Edit a class-owned activity template. Only active `owner_scope='class'` rows
 * belonging to this class are editable here (RLS also enforces the write); any
 * other id 404s. Platform/Institution/Personal types are cloned into the class
 * before they can be edited.
 */
export default async function EditClassTemplatePage({
  params,
}: {
  params: Promise<{ classId: string; templateId: string }>;
}) {
  const { classId, templateId } = await params;
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

  const template = await getTemplateById(templateId, supabase);
  if (
    !template ||
    template.status !== "active" ||
    template.owner_scope !== "class" ||
    template.owner_class_id !== classData.id
  ) {
    notFound();
  }

  return (
    <PageLayout>
      <ClassTemplateEditor
        classDbId={classData.id}
        classShortId={classId}
        template={template}
      />
    </PageLayout>
  );
}
