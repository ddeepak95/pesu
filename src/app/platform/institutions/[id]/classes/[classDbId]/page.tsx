import { notFound } from "next/navigation";

import ClassSettingsClient from "@/app/teacher/classes/[classId]/settings/ClassSettingsClient";
import { requireSuperAdmin } from "@/lib/dal";
import { getInstitutionAiPolicy } from "@/lib/queries/aiInstitutionSettings";
import { getClassAiOverride } from "@/lib/queries/aiClassSettings";
import { getClassAiManagementData } from "@/lib/ai/metering/classAiManagementData";
import { getInstitution } from "@/lib/queries/institutions";
import type { Class } from "@/types/class";

export const metadata = {
  title: "Class settings",
};

const CLASS_COLUMNS =
  "id, name, class_id, created_by, created_at, updated_at, status, preferred_language, group_count, enable_progressive_unlock, student_assignment_strategy, institution_id";

export default async function PlatformClassSettingsPage({
  params,
}: {
  params: Promise<{ id: string; classDbId: string }>;
}) {
  const { id, classDbId } = await params;
  const { user, supabase } = await requireSuperAdmin();

  const [institution, classRes, institutionPolicy, classOverridePolicy, aiData] =
    await Promise.all([
      getInstitution(supabase, id),
      supabase
        .from("classes")
        .select(CLASS_COLUMNS)
        .eq("id", classDbId)
        .maybeSingle(),
      getInstitutionAiPolicy(supabase, id),
      getClassAiOverride(supabase, classDbId),
      getClassAiManagementData(supabase, { classId: classDbId, institutionId: id }),
    ]);

  if (!institution) notFound();
  const cls = classRes.data as Class | null;
  if (!cls || cls.institution_id !== id) notFound();

  return (
    <ClassSettingsClient
      classData={cls}
      classId={cls.class_id}
      userId={user.id}
      viewerRole="super_admin"
      backHref={`/platform/institutions/${id}?tab=classes`}
      backLabel={`Back to ${institution.name}`}
      institutionPolicy={institutionPolicy}
      classOverridePolicy={classOverridePolicy}
      activityTemplatesBasePath={`/platform/institutions/${id}/classes/${classDbId}/activity-templates`}
      aiWallets={aiData.wallets}
      aiClassAccessEnabled={aiData.classAccessEnabled}
      aiPlatformWalletBalance={aiData.platformWalletBalance}
      aiPlatformWalletSpendMode={aiData.platformWalletSpendMode}
      aiUsageBreakdown={aiData.usageBreakdown}
      aiFundingHistory={aiData.fundingHistory}
    />
  );
}
