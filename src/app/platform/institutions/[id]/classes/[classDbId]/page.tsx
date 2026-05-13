import { notFound } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import ClassOverridesView from "@/components/Platform/ClassOverridesView";
import { requireSuperAdmin } from "@/lib/dal";
import { getInstitution } from "@/lib/queries/institutions";

export const metadata = {
  title: "Class overrides",
};

export default async function PlatformClassOverridesPage({
  params,
}: {
  params: Promise<{ id: string; classDbId: string }>;
}) {
  const { id, classDbId } = await params;
  const { supabase } = await requireSuperAdmin();

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
        viewerRole="super_admin"
        backHref={`/platform/institutions/${id}?tab=classes`}
        backLabel={`Back to ${institution.name}`}
      />
    </PageLayout>
  );
}
