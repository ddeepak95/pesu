import { notFound } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import ManageInstitutionActivityTemplates from "@/components/Settings/ManageInstitutionActivityTemplates";
import { requireInstitutionAdminOrSuper } from "@/lib/dal";
import { getInstitution } from "@/lib/queries/institutions";

export const metadata = {
  title: "Manage Activity Templates",
};

/** Institution-admin (or super-admin) surface for managing one institution's activity templates. */
export default async function AdminManageInstitutionTemplatesPage({
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
      <ManageInstitutionActivityTemplates
        institutionId={id}
        institutionName={institution.name}
        basePath={`/admin/institutions/${id}/activity-templates`}
        backHref={`/admin/institutions/${id}?tab=settings`}
        backLabel={`Back to ${institution.name} settings`}
      />
    </PageLayout>
  );
}
