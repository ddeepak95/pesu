"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import GeneralSettingsSection from "@/components/Teacher/Classes/Settings/GeneralSettingsSection";
import ManageTeachersSection from "@/components/Teacher/Classes/Settings/ManageTeachersSection";
import ManageStudentsSection from "@/components/Teacher/Classes/Settings/ManageStudentsSection";
import GroupSettingsSection from "@/components/Teacher/Classes/Settings/GroupSettingsSection";
import ActivityTypesSection from "@/components/Teacher/Classes/Settings/ActivityTypesSection";
import ProfileFieldsSection from "@/components/Teacher/Classes/Settings/ProfileFieldsSection";
import ProgressiveUnlockSection from "@/components/Teacher/Classes/Settings/ProgressiveUnlockSection";
import ResetProgressSection from "@/components/Teacher/Classes/Settings/ResetProgressSection";
import DuplicateClassSection from "@/components/Teacher/Classes/Settings/DuplicateClassSection";
import ArchiveClassSection from "@/components/Teacher/Classes/Settings/ArchiveClassSection";
import { ArchivedClassBanner } from "@/components/Shared/ArchivedClassBanner";
import DangerZoneSection from "@/components/Teacher/Classes/Settings/DangerZoneSection";
import AiConfigMisconfigBanner from "@/components/Settings/AiConfig/AiConfigMisconfigBanner";
import ClassAiManagementTab from "@/components/Settings/ClassAiManagementTab";
import ClassInheritedSettingsSection from "@/components/Settings/ClassInheritedSettingsSection";
import type { AiInstitutionPolicy } from "@/types/aiSettings";
import type { ViewerRole } from "@/lib/settings/capabilities";
import { Class } from "@/types/class";

interface ClassSettingsClientProps {
  classData: Class;
  classId: string;
  userId: string;
  viewerRole: ViewerRole;
  institutionPolicy?: AiInstitutionPolicy;
  /**
   * Optional explicit back-link target. When provided, replaces the default
   * history-based `<BackButton />`. Used by the institution/super-admin
   * drill-down routes so the back arrow returns to the institution detail
   * page on the correct tab.
   */
  backHref?: string;
  backLabel?: string;
  /**
   * Route prefix for "Manage Activity Templates" and its create/edit
   * subpages. Defaults to the teacher route; the institution/super-admin
   * drill-down routes pass their own so the link doesn't 404 for a viewer
   * who isn't a class_teachers member.
   */
  activityTemplatesBasePath?: string;
}

export default function ClassSettingsClient({
  classData: initialClassData,
  classId,
  userId,
  viewerRole,
  backHref,
  backLabel,
  institutionPolicy,
  activityTemplatesBasePath,
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

  const canTransferPrimaryOwnership =
    viewerRole === "institution_admin" || viewerRole === "super_admin";

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

        {initialClassData.status === "archived" && (
          <div className="mb-6">
            <ArchivedClassBanner />
          </div>
        )}

        {initialClassData.institution_id && (
          <div className="mb-6">
            <AiConfigMisconfigBanner
              classDbId={initialClassData.id}
              institutionId={initialClassData.institution_id}
            />
          </div>
        )}

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
                canTransferPrimaryOwnership={canTransferPrimaryOwnership}
                onTeachersChanged={handleUpdated}
              />

              <ManageStudentsSection
                classData={initialClassData}
                canManageRoster={sectionMayEdit}
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

              <ActivityTypesSection
                classData={initialClassData}
                classShortId={classId}
                userId={userId}
                manageHref={activityTemplatesBasePath}
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

          {initialClassData.institution_id && institutionPolicy && (
            <ClassAiManagementTab
              classDbId={initialClassData.id}
              institutionId={initialClassData.institution_id}
              viewerRole={viewerRole}
              institutionPolicy={institutionPolicy}
            />
          )}

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

              <ArchiveClassSection
                classData={initialClassData}
                canArchive={hasFullClassControlView}
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
