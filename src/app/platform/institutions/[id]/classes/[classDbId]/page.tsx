import { notFound } from "next/navigation";

import ClassSettingsClient from "@/app/teacher/classes/[classId]/settings/ClassSettingsClient";
import { requireSuperAdmin } from "@/lib/dal";
import { getInstitution } from "@/lib/queries/institutions";
import type { Class } from "@/types/class";

export const metadata = {
  title: "Class settings",
};

const CLASS_COLUMNS =
  "id, name, class_id, created_by, created_at, updated_at, status, preferred_language, group_count, enable_progressive_unlock, student_assignment_strategy, institution_id";

/**
 * Super-admin drill-down into a single class. Renders the same
 * `ClassSettingsClient` the class owner sees at
 * `/teacher/classes/[shortId]/settings`, with a back link to the platform
 * institution detail page on the Classes tab.
 */
export default async function PlatformClassSettingsPage({
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
      .select(CLASS_COLUMNS)
      .eq("id", classDbId)
      .maybeSingle(),
  ]);

  if (!institution) notFound();
  const cls = classRes.data as Class | null;
  if (!cls || cls.institution_id !== id) notFound();

  return (
    <ClassSettingsClient
      classData={cls}
      classId={cls.class_id}
      isOwner={false}
      viewerRole="super_admin"
      backHref={`/platform/institutions/${id}?tab=classes`}
      backLabel={`Back to ${institution.name}`}
    />
  );
}
