import { notFound } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import { SystemTemplateEditor } from "@/components/Platform/Templates/SystemTemplateEditor";
import { requireSuperAdmin } from "@/lib/dal";
import { getTemplateById } from "@/lib/queries/activityTemplates";

export const metadata = {
  title: "Edit System Template",
};

/**
 * Edit a system-owned (platform) activity template. Only active
 * `owner_scope='system'` rows are editable here (RLS also enforces the
 * write); any other id 404s.
 */
export default async function EditSystemTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireSuperAdmin();

  const template = await getTemplateById(id, supabase);
  if (
    !template ||
    template.status !== "active" ||
    template.owner_scope !== "system"
  ) {
    notFound();
  }

  return (
    <PageLayout>
      <SystemTemplateEditor template={template} />
    </PageLayout>
  );
}
