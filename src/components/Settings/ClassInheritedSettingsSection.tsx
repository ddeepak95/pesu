"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useEffectiveClassSettings } from "@/hooks/swr/useSettings";
import type { ViewerRole } from "@/lib/settings/capabilities";

import SettingsList from "./SettingsList";

interface ClassInheritedSettingsSectionProps {
  classDbId: string;
  classShortId: string;
  viewerRole: ViewerRole;
}

/**
 * Mounted inside the existing class settings page. Lists every registry
 * setting that applies at class scope, showing the inherited value and an
 * "Override for this class" toggle whose visibility is decided by the
 * capabilities helper.
 */
export default function ClassInheritedSettingsSection({
  classDbId,
  classShortId,
  viewerRole,
}: ClassInheritedSettingsSectionProps) {
  const { data: effective } = useEffectiveClassSettings(classDbId);

  if (!effective) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Inherited settings</CardTitle>
          <CardDescription>Loading institution settings...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inherited settings</CardTitle>
        <CardDescription>
          Values inherited from this class&apos;s institution. Where the
          institution allows it, you can override the value for just this class.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SettingsList
          scope="class"
          effective={effective}
          viewerRole={viewerRole}
          classDbId={classDbId}
          classShortId={classShortId}
        />
      </CardContent>
    </Card>
  );
}
