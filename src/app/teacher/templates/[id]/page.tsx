import { notFound } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import { TemplateDetail } from "@/components/Teacher/Templates/TemplateDetail";
import { verifySession } from "@/lib/dal";
import { getTemplateById } from "@/lib/queries/activityTemplates";

export const metadata = {
  title: "Template",
};

/**
 * The public share / detail surface (§7.5, §9). Any teacher who has the link to
 * a `public` template (or can otherwise read it — own, class, system) opens it
 * here and clicks Clone. This is the whole public-sharing surface: no browsable
 * gallery, no report/takedown. RLS decides readability; unreadable → notFound.
 */
export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, supabase } = await verifySession();

  const template = await getTemplateById(id, supabase);
  if (!template || template.status === "archived") notFound();

  const isOwner =
    template.owner_scope === "user" && template.owner_user_id === user.id;

  return (
    <PageLayout>
      <TemplateDetail template={template} isOwner={isOwner} />
    </PageLayout>
  );
}
