import { notFound } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import { UserTemplateEditor } from "@/components/Teacher/Templates/UserTemplateEditor";
import { verifySession } from "@/lib/dal";
import { getTemplateById } from "@/lib/queries/activityTemplates";

export const metadata = {
  title: "Edit Template",
};

/**
 * Edit a personal-library activity template. Only active `owner_scope='user'`
 * rows owned by this teacher are editable here (RLS also enforces the write);
 * any other id 404s.
 */
export default async function EditUserTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, supabase } = await verifySession();

  const template = await getTemplateById(id, supabase);
  if (
    !template ||
    template.status !== "active" ||
    template.owner_scope !== "user" ||
    template.owner_user_id !== user.id
  ) {
    notFound();
  }

  return (
    <PageLayout>
      <UserTemplateEditor template={template} />
    </PageLayout>
  );
}
