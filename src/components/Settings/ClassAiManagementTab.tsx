"use client";

import {
  canViewClassOverrideSections,
  type ViewerRole,
} from "@/lib/settings/capabilities";
import type { AiClassOverridePolicy, AiInstitutionPolicy } from "@/types/aiSettings";

import AiSettingsPageContent from "./AiConfig/AiSettingsPageContent";

interface ClassAiManagementTabProps {
  classDbId: string;
  classShortId?: string | null;
  institutionId: string;
  viewerRole: ViewerRole;
  institutionPolicy: AiInstitutionPolicy;
  classOverridePolicy: AiClassOverridePolicy;
}

export default function ClassAiManagementTab({
  classDbId,
  classShortId,
  institutionId,
  viewerRole,
  institutionPolicy,
  classOverridePolicy,
}: ClassAiManagementTabProps) {
  const allowChildOverride = classOverridePolicy.allowChildOverride;

  if (!canViewClassOverrideSections(viewerRole, allowChildOverride)) {
    return null;
  }

  return (
    <AiSettingsPageContent
      scope="class"
      scopeId={classDbId}
      classShortId={classShortId}
      institutionId={institutionId}
      title="Class AI configuration"
      description="Override institution model assignments for this class, or inherit institution defaults per provider and app function."
      viewerRole={viewerRole}
      institutionPolicy={institutionPolicy}
      classOverridePolicy={classOverridePolicy}
    />
  );
}
