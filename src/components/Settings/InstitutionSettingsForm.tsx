"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useEffectiveInstitutionSettings } from "@/hooks/swr/useSettings";
import type { ViewerRole } from "@/lib/settings/capabilities";
import type { EffectiveSettings } from "@/lib/settings/resolve";

import SettingsList from "./SettingsList";

interface InstitutionSettingsFormProps {
  institutionId: string;
  viewerRole: ViewerRole;
  /**
   * Server-resolved initial bundle. The component subscribes to SWR for
   * subsequent updates so save -> refresh round-trips don't need a full
   * page reload.
   */
  initialEffective: EffectiveSettings;
}

export default function InstitutionSettingsForm({
  institutionId,
  viewerRole,
  initialEffective,
}: InstitutionSettingsFormProps) {
  const { data: effective } = useEffectiveInstitutionSettings(institutionId);
  const resolved = effective ?? initialEffective;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Institution settings</CardTitle>
        <CardDescription>
          Default values that apply to every class in this institution. Toggle
          &ldquo;Allow classes to override&rdquo; to let individual classes diverge.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SettingsList
          scope="institution"
          effective={resolved}
          viewerRole={viewerRole}
          institutionId={institutionId}
        />
      </CardContent>
    </Card>
  );
}
