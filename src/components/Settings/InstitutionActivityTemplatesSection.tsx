"use client";

import ActivityTemplatesSummaryCard from "@/components/Shared/ActivityTemplatesSummaryCard";
import type { TemplateOwnerScope } from "@/lib/queries/activityTemplates";
import { useAvailableTemplatesForInstitution } from "@/hooks/swr";

interface InstitutionActivityTemplatesSectionProps {
  institutionId: string;
  /** "Manage Activity Templates" link target. */
  manageHref: string;
}

const SCOPE_LABEL: Record<TemplateOwnerScope, string> = {
  system: "Platform",
  class: "Class",
  user: "Personal",
  institution: "Institution",
};

/**
 * Institution settings counterpart to the class settings "Activity Types"
 * section (`Teacher/Classes/Settings/ActivityTypesSection`) — same
 * summary-card + "Manage" link-out pattern, showing this institution's
 * resolved availability set (default-listed system templates + all of this
 * institution's own authored templates) instead of a class's palette.
 */
export default function InstitutionActivityTemplatesSection({
  institutionId,
  manageHref,
}: InstitutionActivityTemplatesSectionProps) {
  const availableQuery = useAvailableTemplatesForInstitution(institutionId);

  return (
    <ActivityTemplatesSummaryCard
      title="Activity Templates"
      description="The activity types default-listed for classes in this institution, plus any templates this institution has authored. Use Manage Activity Templates to curate platform types or create your own."
      items={(availableQuery.data ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        badge: SCOPE_LABEL[t.owner_scope],
      }))}
      loading={availableQuery.isLoading}
      emptyMessage="No activity types are available in this institution yet."
      manageHref={manageHref}
    />
  );
}
