import Link from "next/link";

import ClassInheritedSettingsSection from "@/components/Settings/ClassInheritedSettingsSection";
import type { ViewerRole } from "@/lib/settings/capabilities";

export interface ClassOverridesViewProps {
  classDbId: string;
  classShortId: string;
  className: string;
  classStatus: string;
  institutionName: string;
  viewerRole: ViewerRole;
  /**
   * Back-link target. Callers should round-trip the `?tab=classes` query so
   * the user lands on the right tab of the institution detail page.
   */
  backHref: string;
  backLabel: string;
}

/**
 * Shared drill-down view rendered by
 *   * `/platform/institutions/[id]/classes/[classDbId]` (super-admin) and
 *   * `/admin/institutions/[id]/classes/[classDbId]`    (institution-admin).
 *
 * Shows the class header and the inherited-settings section so admins can
 * review and (where allowed) override institution-level values per class.
 */
export default function ClassOverridesView({
  classDbId,
  classShortId,
  className,
  classStatus,
  institutionName,
  viewerRole,
  backHref,
  backLabel,
}: ClassOverridesViewProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Link
          href={backHref}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          &larr; {backLabel}
        </Link>
        <h1 className="text-2xl font-semibold">{className}</h1>
        <p className="text-muted-foreground text-sm">
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            {classShortId}
          </code>
          {" · "}status {classStatus}
          {" · "}institution {institutionName}
        </p>
      </div>

      <ClassInheritedSettingsSection
        classDbId={classDbId}
        classShortId={classShortId}
        viewerRole={viewerRole}
      />
    </div>
  );
}
