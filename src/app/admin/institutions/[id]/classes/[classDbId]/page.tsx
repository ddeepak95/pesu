import { notFound } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import ClassOverridesView from "@/components/Platform/ClassOverridesView";
import { requireInstitutionAdminOrSuper } from "@/lib/dal";
import { getInstitution } from "@/lib/queries/institutions";

export const metadata = {
  title: "Class overrides",
};

export default async function AdminClassOverridesPage({
  params,
}: {
  params: Promise<{ id: string; classDbId: string }>;
}) {
  const { id, classDbId } = await params;
  const { supabase, viewerRole } = await requireInstitutionAdminOrSuper(id);

  const [institution, classRes] = await Promise.all([
    getInstitution(supabase, id),
    supabase
      .from("classes")
      .select("id, class_id, name, status, institution_id")
      .eq("id", classDbId)
      .maybeSingle(),
  ]);

  if (!institution) notFound();
  const cls = classRes.data;
  if (!cls || cls.institution_id !== id) notFound();

  return (
    <PageLayout>
      <ClassOverridesView
        classDbId={cls.id}
        classShortId={cls.class_id}
        className={cls.name}
        classStatus={cls.status}
        institutionName={institution.name}
        viewerRole={viewerRole}
        backHref={`/admin/institutions/${id}?tab=classes`}
        backLabel={`Back to ${institution.name}`}
      />
    </PageLayout>
  );
}
