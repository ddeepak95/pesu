import { notFound, redirect } from "next/navigation";

import { verifySession } from "@/lib/dal";
import { getInstitutionAiPolicy } from "@/lib/queries/aiInstitutionSettings";
import { getClassAiOverride } from "@/lib/queries/aiClassSettings";
import { getClassAiManagementData } from "@/lib/ai/metering/classAiManagementData";
import { resolveClassSettingsViewer } from "@/lib/settings/classViewerRole";

import ClassSettingsClient from "./ClassSettingsClient";

export const metadata = {
  title: "Class Settings",
};

const CLASS_COLUMNS =
  "id, name, class_id, created_by, created_at, updated_at, status, preferred_language, language_config, group_count, enable_progressive_unlock, student_assignment_strategy, institution_id";

export default async function ClassSettingsPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const { user, supabase } = await verifySession("/teacher/login");

  const { data: classData } = await supabase
    .from("classes")
    .select(CLASS_COLUMNS)
    .eq("class_id", classId)
    .in("status", ["active", "archived"])
    .single();

  if (!classData) notFound();

  const { viewerRole } = await resolveClassSettingsViewer(
    supabase,
    user.id,
    classData.id,
  );

  const mayConfigureClass =
    viewerRole === "class_owner" ||
    viewerRole === "class_teacher_co_owner" ||
    viewerRole === "class_teacher_admin" ||
    viewerRole === "institution_admin" ||
    viewerRole === "super_admin";

  if (!mayConfigureClass) {
    redirect(`/teacher/classes/${classId}`);
  }

  const institutionId = classData.institution_id as string | undefined;
  const [institutionPolicy, classOverridePolicy, aiData] = institutionId
    ? await Promise.all([
        getInstitutionAiPolicy(supabase, institutionId),
        getClassAiOverride(supabase, classData.id),
        getClassAiManagementData(supabase, { classId: classData.id, institutionId }),
      ])
    : [undefined, undefined, undefined];

  return (
    <ClassSettingsClient
      classData={classData}
      classId={classId}
      userId={user.id}
      viewerRole={viewerRole}
      institutionPolicy={institutionPolicy}
      classOverridePolicy={classOverridePolicy}
      backHref={`/teacher/classes/${classId}`}
      backLabel={`Back to class`}
      aiWallets={aiData?.wallets}
      aiClassAccessEnabled={aiData?.classAccessEnabled}
      aiPlatformWalletBalance={aiData?.platformWalletBalance}
      aiUsageBreakdown={aiData?.usageBreakdown}
      aiFundingHistory={aiData?.fundingHistory}
    />
  );
}
