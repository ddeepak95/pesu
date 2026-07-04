import { notFound } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import { InstitutionTemplateEditor } from "@/components/Platform/Templates/InstitutionTemplateEditor";
import { requireInstitutionAdminOrSuper } from "@/lib/dal";
import { getInstitution } from "@/lib/queries/institutions";

export const metadata = {
  title: "New Institution Template",
};

/** Create a new institution-owned activity template, from the institution-admin surface. */
export default async function AdminNewInstitutionTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireInstitutionAdminOrSuper(id);

  const institution = await getInstitution(supabase, id);
  if (!institution) notFound();

  return (
    <PageLayout>
      <InstitutionTemplateEditor
        institutionId={id}
        basePath={`/admin/institutions/${id}/activity-templates`}
      />
    </PageLayout>
  );
}
