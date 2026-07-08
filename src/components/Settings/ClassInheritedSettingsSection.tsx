"use client";

import { Card, CardContent } from "@/components/ui/card";
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
        <CardContent className="pt-6">Loading institution settings...</CardContent>
      </Card>
    );
  }

  const allowChildOverride = institutionAllowsClassSettingsOverride(effective);
  if (!canViewClassOverrideSections(viewerRole, allowChildOverride)) {
    return null;
  }

  return (
    <Card>
      <CardContent className="pt-6">
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
