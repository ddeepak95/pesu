"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useClassAiConfigs,
  useInstitutionAiConfigs,
} from "@/hooks/swr/useAiCapabilityConfigs";
import {
  canViewClassOverrideSections,
  type ViewerRole,
} from "@/lib/settings/capabilities";
import type { EffectiveAiConfigs } from "@/types/aiCapabilityConfig";

import AiCapabilityConfigList from "./AiConfig/AiCapabilityConfigList";

interface ClassAiConfigSectionProps {
  classDbId: string;
  classShortId: string;
  institutionId: string;
  viewerRole: ViewerRole;
  initialEffective: EffectiveAiConfigs;
  initialInstitutionEffective?: EffectiveAiConfigs;
}

export default function ClassAiConfigSection({
  classDbId,
  classShortId,
  institutionId,
  viewerRole,
  initialEffective,
  initialInstitutionEffective,
}: ClassAiConfigSectionProps) {
  const { data: effective } = useClassAiConfigs(classDbId);
  const { data: institutionEffective } =
    useInstitutionAiConfigs(institutionId);
  const resolved = effective ?? initialEffective;
  const instResolved =
    institutionEffective ?? initialInstitutionEffective;

  if (!instResolved) {
    return null;
  }

  const allowChildOverride = resolved.institutionPolicy.allowChildOverride;
  if (!canViewClassOverrideSections(viewerRole, allowChildOverride)) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI configuration</CardTitle>
        <CardDescription>
          Override institution text AI settings for this class. One provider,
          model, and API key for all text-based features (chat, evaluation,
          rubrics, etc.).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AiCapabilityConfigList
          mode="class"
          scopeId={classDbId}
          classShortId={classShortId}
          viewerRole={viewerRole}
          effective={resolved}
          institutionEffective={instResolved}
        />
      </CardContent>
    </Card>
  );
}
