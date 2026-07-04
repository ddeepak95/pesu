import { notFound } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import { ClassTemplateEditor } from "@/components/Teacher/Classes/Settings/ClassTemplateEditor";
import { requireInstitutionAdminOrSuper } from "@/lib/dal";
import { getTemplateById } from "@/lib/queries/activityTemplates";

export const metadata = {
  title: "Edit Activity Type",
};

/**
 * Edit a class-owned activity template, from the institution-admin surface.
 * Only active `owner_scope='class'` rows belonging to this class are
 * editable here (RLS also enforces the write); any other id 404s.
 */
export default async function AdminEditClassTemplatePage({
  params,
}: {
  params: Promise<{ id: string; classDbId: string; templateId: string }>;
}) {
  const { id, classDbId, templateId } = await params;
  const { supabase } = await requireInstitutionAdminOrSuper(id);

  const { data: classData } = await supabase
    .from("classes")
    .select("id, class_id, institution_id")
    .eq("id", classDbId)
    .maybeSingle();
  if (!classData || classData.institution_id !== id) notFound();

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
        classShortId={classData.class_id}
        template={template}
        basePath={`/admin/institutions/${id}/classes/${classDbId}/activity-templates`}
      />
    </PageLayout>
  );
}
