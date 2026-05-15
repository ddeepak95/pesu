"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useEffectiveClassSettings } from "@/hooks/swr/useSettings";
import {
  canViewClassOverrideSections,
  type ViewerRole,
} from "@/lib/settings/capabilities";
import { institutionAllowsClassSettingsOverride } from "@/lib/settings/resolve";

import SettingsList from "./SettingsList";

interface ClassInheritedSettingsSectionProps {
  classDbId: string;
  classShortId: string;
  viewerRole: ViewerRole;
}

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

  const allowChildOverride = institutionAllowsClassSettingsOverride(effective);
  if (!canViewClassOverrideSections(viewerRole, allowChildOverride)) {
    return null;
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
