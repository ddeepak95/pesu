"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import GeneralSettingsSection from "@/components/Teacher/Classes/Settings/GeneralSettingsSection";
import ManageTeachersSection from "@/components/Teacher/Classes/Settings/ManageTeachersSection";
import GroupSettingsSection from "@/components/Teacher/Classes/Settings/GroupSettingsSection";
import ProfileFieldsSection from "@/components/Teacher/Classes/Settings/ProfileFieldsSection";
import ProgressiveUnlockSection from "@/components/Teacher/Classes/Settings/ProgressiveUnlockSection";
import ResetProgressSection from "@/components/Teacher/Classes/Settings/ResetProgressSection";
import DuplicateClassSection from "@/components/Teacher/Classes/Settings/DuplicateClassSection";
import DangerZoneSection from "@/components/Teacher/Classes/Settings/DangerZoneSection";
import ClassInheritedSettingsSection from "@/components/Settings/ClassInheritedSettingsSection";
import type { ViewerRole } from "@/lib/settings/capabilities";
import { Class } from "@/types/class";

interface ClassSettingsClientProps {
  classData: Class;
  classId: string;
  viewerRole: ViewerRole;
  /**
   * Optional explicit back-link target. When provided, replaces the default
   * history-based `<BackButton />`. Used by the institution/super-admin
   * drill-down routes so the back arrow returns to the institution detail
   * page on the correct tab.
   */
  backHref?: string;
  backLabel?: string;
}

export default function ClassSettingsClient({
  classData: initialClassData,
  classId,
  viewerRole,
  backHref,
  backLabel,
}: ClassSettingsClientProps) {
  const router = useTrackedRouter();

  const handleUpdated = useCallback(() => {
    router.refresh();
  }, [router]);

  const canConfigureSettings =
    viewerRole === "class_owner" ||
    viewerRole === "class_teacher_co_owner" ||
    viewerRole === "class_teacher_admin" ||
    viewerRole === "institution_admin" ||
    viewerRole === "super_admin";

  const hasFullClassControlView =
    viewerRole === "class_owner" ||
    viewerRole === "class_teacher_co_owner" ||
    viewerRole === "institution_admin" ||
    viewerRole === "super_admin";

  const canPromoteCoOwner = hasFullClassControlView;

  /** Legacy prop name on settings sections: permitted to change settings here. */
  const sectionMayEdit = canConfigureSettings;

  return (
    <PageLayout>
      <div>
        <div className="mb-4">
          {backHref && backLabel ? (
            <Link
              href={backHref}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              &larr; {backLabel}
            </Link>
          ) : (
            <BackButton />
          )}
        </div>
        <h1 className="text-3xl font-bold mb-2">{initialClassData.name}</h1>
        <p className="text-muted-foreground mb-8">
          Manage settings for this class.
        </p>

        <div className="space-y-6">
          {canConfigureSettings && (
            <>
              <GeneralSettingsSection
                classData={initialClassData}
                isOwner={sectionMayEdit}
                onUpdated={handleUpdated}
              />

              <ManageTeachersSection
                classData={initialClassData}
                canManageRoster={sectionMayEdit}
                canPromoteCoOwner={canPromoteCoOwner}
              />

              <GroupSettingsSection
                classData={initialClassData}
                isOwner={sectionMayEdit}
                onUpdated={handleUpdated}
              />

              <ProfileFieldsSection
                classData={initialClassData}
                isOwner={sectionMayEdit}
              />

              <ProgressiveUnlockSection
                classData={initialClassData}
                isOwner={sectionMayEdit}
                onUpdated={handleUpdated}
              />
            </>
          )}

          <ClassInheritedSettingsSection
            classDbId={initialClassData.id}
            classShortId={classId}
            viewerRole={viewerRole}
          />

          {canConfigureSettings && (
            <>
              <ResetProgressSection
                classId={initialClassData.id}
                isOwner={sectionMayEdit}
              />

              <DuplicateClassSection
                classData={initialClassData}
                isOwner={sectionMayEdit}
                onDuplicated={handleUpdated}
              />

              <DangerZoneSection
                classData={initialClassData}
                canDeleteClass={hasFullClassControlView}
              />
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
