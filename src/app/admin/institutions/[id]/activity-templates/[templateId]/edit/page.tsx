import { notFound } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import { InstitutionTemplateEditor } from "@/components/Platform/Templates/InstitutionTemplateEditor";
import { requireInstitutionAdminOrSuper } from "@/lib/dal";
import { getInstitution } from "@/lib/queries/institutions";
import { getTemplateById } from "@/lib/queries/activityTemplates";

export const metadata = {
  title: "Edit Institution Template",
};

/**
 * Edit an institution-owned activity template, from the institution-admin
 * surface. Only active `owner_scope='institution'` rows belonging to this
 * institution are editable here (RLS also enforces the write); any other id
 * 404s.
 */
export default async function AdminEditInstitutionTemplatePage({
  params,
}: {
  params: Promise<{ id: string; templateId: string }>;
}) {
  const { id, templateId } = await params;
  const { supabase } = await requireInstitutionAdminOrSuper(id);

  const institution = await getInstitution(supabase, id);
  if (!institution) notFound();

  const template = await getTemplateById(templateId, supabase);
  if (
    !template ||
    template.status !== "active" ||
    template.owner_scope !== "institution" ||
    template.institution_id !== id
  ) {
    notFound();
  }

  return (
    <PageLayout>
      <InstitutionTemplateEditor
        institutionId={id}
        basePath={`/admin/institutions/${id}/activity-templates`}
        template={template}
      />
    </PageLayout>
  );
}
