import { notFound } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import ManageInstitutionActivityTemplates from "@/components/Settings/ManageInstitutionActivityTemplates";
import { requireSuperAdmin } from "@/lib/dal";
import { getInstitution } from "@/lib/queries/institutions";

export const metadata = {
  title: "Manage Activity Templates",
};

/** Super-admin surface for managing one institution's activity templates. */
export default async function PlatformManageInstitutionTemplatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireSuperAdmin();

  const institution = await getInstitution(supabase, id);
  if (!institution) notFound();

  return (
    <PageLayout>
      <ManageInstitutionActivityTemplates
        institutionId={id}
        institutionName={institution.name}
        basePath={`/platform/institutions/${id}/activity-templates`}
        backHref={`/platform/institutions/${id}?tab=settings`}
        backLabel={`Back to ${institution.name} settings`}
      />
    </PageLayout>
  );
}
