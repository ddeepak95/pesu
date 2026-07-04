"use client";

import ActivityTemplatesSummaryCard from "@/components/Shared/ActivityTemplatesSummaryCard";
import { Class } from "@/types/class";
import type { TemplateOwnerScope } from "@/lib/queries/activityTemplates";
import { useAvailableTemplatesForClass } from "@/hooks/swr";

interface ActivityTypesSectionProps {
  classData: Class;
  classShortId: string;
  userId: string;
  /** "Manage Activity Templates" link target. Defaults to the teacher route. */
  manageHref?: string;
}

const SCOPE_LABEL: Record<TemplateOwnerScope, string> = {
  system: "Platform",
  class: "Class",
  user: "Personal",
  institution: "Institution",
};

export default function ActivityTypesSection({
  classData,
  classShortId,
  manageHref = `/teacher/classes/${classShortId}/settings/activity-templates`,
}: ActivityTypesSectionProps) {
  const availableQuery = useAvailableTemplatesForClass(classData.id);

  return (
    <ActivityTemplatesSummaryCard
      title="Activity Types"
      description="The activity types teachers can pick when building an assignment in this class. Use Manage Activity Templates to turn system types on or off, create class-owned types, or add types from your library."
      items={(availableQuery.data ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        badge: SCOPE_LABEL[t.owner_scope],
      }))}
      loading={availableQuery.isLoading}
      emptyMessage="No activity types are available in this class yet."
      manageHref={manageHref}
    />
  );
}
