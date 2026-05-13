"use client";

import { useCallback } from "react";
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
}

export default function ClassSettingsClient({
  classData: initialClassData,
  classId,
  isOwner,
  viewerRole,
}: ClassSettingsClientProps) {
  const router = useTrackedRouter();

  const handleUpdated = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <PageLayout>
      <div>
        <div className="mb-4">
          <BackButton />
        </div>
        <h1 className="text-3xl font-bold mb-2">{initialClassData.name}</h1>
        <p className="text-muted-foreground mb-8">
          Manage settings for this class.
        </p>

        <div className="space-y-6">
          {isOwner && (
            <>
              <GeneralSettingsSection
                classData={initialClassData}
                isOwner={isOwner}
                onUpdated={handleUpdated}
              />

              <ManageTeachersSection
                classData={initialClassData}
                isOwner={isOwner}
              />

              <GroupSettingsSection
                classData={initialClassData}
                isOwner={isOwner}
                onUpdated={handleUpdated}
              />

              <ProfileFieldsSection
                classData={initialClassData}
                isOwner={isOwner}
              />

              <ProgressiveUnlockSection
                classData={initialClassData}
                isOwner={isOwner}
                onUpdated={handleUpdated}
              />
            </>
          )}

          <ClassInheritedSettingsSection
            classDbId={initialClassData.id}
            classShortId={classId}
            viewerRole={viewerRole}
          />

          {isOwner && (
            <>
              <ResetProgressSection
                classId={initialClassData.id}
                isOwner={isOwner}
              />

              <DuplicateClassSection
                classData={initialClassData}
                isOwner={isOwner}
                onDuplicated={handleUpdated}
              />

              <DangerZoneSection
                classData={initialClassData}
                isOwner={isOwner}
              />
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
