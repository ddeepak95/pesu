"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useInstitutionAiConfigs } from "@/hooks/swr/useAiCapabilityConfigs";
import {
  canViewInstitutionOverrideSections,
  type ViewerRole,
} from "@/lib/settings/capabilities";
import type { EffectiveAiConfigs } from "@/types/aiCapabilityConfig";

import AiCapabilityConfigList from "./AiConfig/AiCapabilityConfigList";

interface InstitutionAiConfigCardProps {
  institutionId: string;
  viewerRole: ViewerRole;
  initialEffective: EffectiveAiConfigs;
}

export default function InstitutionAiConfigCard({
  institutionId,
  viewerRole,
  initialEffective,
}: InstitutionAiConfigCardProps) {
  const { data: effective } = useInstitutionAiConfigs(institutionId);
  const resolved = effective ?? initialEffective;

  if (
    !canViewInstitutionOverrideSections(
      viewerRole,
      resolved.institutionPolicy.allowAdminEdit,
    )
  ) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI configuration</CardTitle>
        <CardDescription>
          Text-based AI: one provider, model, and API key for chat, evaluation,
          rubrics, and related features. Locks below apply to AI only (not
          inherited settings).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AiCapabilityConfigList
          mode="institution"
          scopeId={institutionId}
          viewerRole={viewerRole}
          effective={resolved}
        />
      </CardContent>
    </Card>
  );
}
