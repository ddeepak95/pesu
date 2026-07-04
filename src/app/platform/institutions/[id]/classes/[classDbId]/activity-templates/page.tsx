import { notFound } from "next/navigation";

import ManageActivityTemplates from "@/components/Teacher/Classes/Settings/ManageActivityTemplates";
import { requireSuperAdmin } from "@/lib/dal";

export const metadata = {
  title: "Manage Activity Templates",
};

/**
 * Super-admin counterpart to `/teacher/classes/[classId]/settings/activity-templates`
 * — reachable even when the viewer isn't a `class_teachers` member of this class.
 */
export default async function PlatformManageActivityTemplatesPage({
  params,
}: {
  params: Promise<{ id: string; classDbId: string }>;
}) {
  const { id, classDbId } = await params;
  const { user, supabase } = await requireSuperAdmin();

  const { data: classData } = await supabase
    .from("classes")
    .select("id, name, class_id, institution_id")
    .eq("id", classDbId)
    .maybeSingle();
  if (!classData || classData.institution_id !== id) notFound();

  const basePath = `/platform/institutions/${id}/classes/${classDbId}/activity-templates`;

  return (
    <ManageActivityTemplates
      classDbId={classData.id}
      classShortId={classData.class_id}
      classDisplayName={classData.name}
      userId={user.id}
      institutionId={classData.institution_id}
      basePath={basePath}
      backHref={`/platform/institutions/${id}/classes/${classDbId}`}
      backLabel="Class settings"
    />
  );
}
