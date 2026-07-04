import { notFound } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import { ClassTemplateEditor } from "@/components/Teacher/Classes/Settings/ClassTemplateEditor";
import { requireSuperAdmin } from "@/lib/dal";

export const metadata = {
  title: "Create Activity Type",
};

/** Create a new class-owned activity template, from the super-admin surface. */
export default async function PlatformNewClassTemplatePage({
  params,
}: {
  params: Promise<{ id: string; classDbId: string }>;
}) {
  const { id, classDbId } = await params;
  const { supabase } = await requireSuperAdmin();

  const { data: classData } = await supabase
    .from("classes")
    .select("id, class_id, institution_id")
    .eq("id", classDbId)
    .maybeSingle();
  if (!classData || classData.institution_id !== id) notFound();

  return (
    <PageLayout>
      <ClassTemplateEditor
        classDbId={classData.id}
        classShortId={classData.class_id}
        basePath={`/platform/institutions/${id}/classes/${classDbId}/activity-templates`}
      />
    </PageLayout>
  );
}
