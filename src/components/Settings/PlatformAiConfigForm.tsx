"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePlatformAiConfigs } from "@/hooks/swr/useAiCapabilityConfigs";
import type { ViewerRole } from "@/lib/settings/capabilities";
import type { EffectiveAiConfigs } from "@/types/aiCapabilityConfig";

import AiCapabilityConfigList from "./AiConfig/AiCapabilityConfigList";

interface PlatformAiConfigFormProps {
  viewerRole: ViewerRole;
  initialEffective: EffectiveAiConfigs;
}

export default function PlatformAiConfigForm({
  viewerRole,
  initialEffective,
}: PlatformAiConfigFormProps) {
  const { data: effective } = usePlatformAiConfigs();
  const resolved = effective ?? initialEffective;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform AI defaults</CardTitle>
        <CardDescription>
          One text AI configuration for all text-based features (chat,
          evaluation, rubrics, dynamic questions). Institutions can use these
          defaults or configure their own.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AiCapabilityConfigList
          mode="platform"
          scopeId=""
          viewerRole={viewerRole}
          effective={resolved}
        />
      </CardContent>
    </Card>
  );
}
