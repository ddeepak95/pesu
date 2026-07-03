import { notFound } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import { TemplateReadOnly } from "@/components/Teacher/Templates/TemplateReadOnly";
import { verifySession } from "@/lib/dal";
import { getTemplateById } from "@/lib/queries/activityTemplates";

export const metadata = {
  title: "Template Preview",
};

/**
 * Scope-neutral, read-only preview of an activity-type template. Reachable from
 * the "Add from Library" dialog (opened in a new tab) and intended to double as
 * a public share link later. RLS (`activity_templates_read`) decides
 * readability — system / public / your own / co-taught-class templates open;
 * anything else returns notFound.
 */
export default async function TemplatePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await verifySession("/teacher/login");

  const template = await getTemplateById(id, supabase);
  if (!template || template.status === "archived") notFound();

  return (
    <PageLayout>
      <TemplateReadOnly template={template} />
    </PageLayout>
  );
}
