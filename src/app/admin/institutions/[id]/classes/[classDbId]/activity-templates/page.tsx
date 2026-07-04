import { notFound } from "next/navigation";

import ManageActivityTemplates from "@/components/Teacher/Classes/Settings/ManageActivityTemplates";
import { requireInstitutionAdminOrSuper } from "@/lib/dal";

export const metadata = {
  title: "Manage Activity Templates",
};

/**
 * Institution-admin (or super-admin) counterpart to
 * `/teacher/classes/[classId]/settings/activity-templates` — reachable even
 * when the viewer isn't a `class_teachers` member of this class.
 */
export default async function AdminManageActivityTemplatesPage({
  params,
}: {
  params: Promise<{ id: string; classDbId: string }>;
}) {
  const { id, classDbId } = await params;
  const { user, supabase } = await requireInstitutionAdminOrSuper(id);

  const { data: classData } = await supabase
    .from("classes")
    .select("id, name, class_id, institution_id")
    .eq("id", classDbId)
    .maybeSingle();
  if (!classData || classData.institution_id !== id) notFound();

  const basePath = `/admin/institutions/${id}/classes/${classDbId}/activity-templates`;

  return (
    <ManageActivityTemplates
      classDbId={classData.id}
      classShortId={classData.class_id}
      classDisplayName={classData.name}
      userId={user.id}
      basePath={basePath}
      backHref={`/admin/institutions/${id}/classes/${classDbId}`}
      backLabel="Class settings"
    />
  );
}
