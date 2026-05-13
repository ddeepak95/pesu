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
  isOwner: boolean;
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
  isOwner,
  viewerRole,
  backHref,
  backLabel,
}: ClassSettingsClientProps) {
  const router = useTrackedRouter();

  const handleUpdated = useCallback(() => {
    router.refresh();
  }, [router]);

  // "Can manage" is the union of class ownership and institution/super-admin
  // access. The owner-only sections were previously gated by `isOwner`; they
  // now show whenever the viewer is allowed to administer the class. The
  // `isOwner` prop on each section keeps its current name but receives the
  // broader value — sections still read it as "is the viewer permitted to
  // make changes here?", which is the contract we want.
  const canManage =
    isOwner ||
    viewerRole === "institution_admin" ||
    viewerRole === "super_admin";

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
          {canManage && (
            <>
              <GeneralSettingsSection
                classData={initialClassData}
                isOwner={canManage}
                onUpdated={handleUpdated}
              />

              <ManageTeachersSection
                classData={initialClassData}
                isOwner={canManage}
              />

              <GroupSettingsSection
                classData={initialClassData}
                isOwner={canManage}
                onUpdated={handleUpdated}
              />

              <ProfileFieldsSection
                classData={initialClassData}
                isOwner={canManage}
              />

              <ProgressiveUnlockSection
                classData={initialClassData}
                isOwner={canManage}
                onUpdated={handleUpdated}
              />
            </>
          )}

          <ClassInheritedSettingsSection
            classDbId={initialClassData.id}
            classShortId={classId}
            viewerRole={viewerRole}
          />

          {canManage && (
            <>
              <ResetProgressSection
                classId={initialClassData.id}
                isOwner={canManage}
              />

              <DuplicateClassSection
                classData={initialClassData}
                isOwner={canManage}
                onDuplicated={handleUpdated}
              />

              <DangerZoneSection
                classData={initialClassData}
                isOwner={canManage}
              />
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
