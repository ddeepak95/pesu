"use client";

import {
  canViewClassOverrideSections,
  type ViewerRole,
} from "@/lib/settings/capabilities";
import type { AiInstitutionPolicy } from "@/types/aiSettings";

import AiSettingsPageContent from "./AiConfig/AiSettingsPageContent";

interface ClassAiManagementTabProps {
  classDbId: string;
  institutionId: string;
  viewerRole: ViewerRole;
  institutionPolicy: AiInstitutionPolicy;
}

export default function ClassAiManagementTab({
  classDbId,
  institutionId,
  viewerRole,
  institutionPolicy,
}: ClassAiManagementTabProps) {
  const allowChildOverride = institutionPolicy.allowChildOverride;

  if (!canViewClassOverrideSections(viewerRole, allowChildOverride)) {
    return (
      <p className="text-sm text-muted-foreground">
        Class AI overrides are disabled by your institution.
      </p>
    );
  }

  return (
    <AiSettingsPageContent
      scope="class"
      scopeId={classDbId}
      institutionId={institutionId}
      title="Class AI configuration"
      description="Override institution model assignments for this class, or inherit institution defaults per provider and app function."
      viewerRole={viewerRole}
      institutionPolicy={institutionPolicy}
    />
  );
}
