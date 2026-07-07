"use client";

import {
  canViewInstitutionOverrideSections,
  type ViewerRole,
} from "@/lib/settings/capabilities";
import type { AiInstitutionPolicy } from "@/types/aiSettings";

import AiSettingsPageContent from "./AiConfig/AiSettingsPageContent";

interface InstitutionAiManagementTabProps {
  institutionId: string;
  viewerRole: ViewerRole;
  institutionPolicy: AiInstitutionPolicy;
}

export default function InstitutionAiManagementTab({
  institutionId,
  viewerRole,
  institutionPolicy,
}: InstitutionAiManagementTabProps) {
  if (
    !canViewInstitutionOverrideSections(
      viewerRole,
      institutionPolicy.allowAdminEdit,
    )
  ) {
    return (
      <p className="text-sm text-muted-foreground">
        AI management is not available for your role or institution policy.
      </p>
    );
  }

  return (
    <AiSettingsPageContent
      scope="institution"
      scopeId={institutionId}
      title="AI management"
      description="Activate providers with institution keys or use platform keys per provider. App functions inherit platform model assignments unless you customize them."
      viewerRole={viewerRole}
      institutionPolicy={institutionPolicy}
      showLocks
    />
  );
}
