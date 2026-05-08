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
import { Class } from "@/types/class";

interface ClassSettingsClientProps {
  classData: Class;
  classId: string;
}

export default function ClassSettingsClient({
  classData: initialClassData,
  classId: _classId,
}: ClassSettingsClientProps) {
  const router = useTrackedRouter();

  // After a settings update, refresh server data via router.refresh()
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
          <GeneralSettingsSection
            classData={initialClassData}
            isOwner={true}
            onUpdated={handleUpdated}
          />

          <ManageTeachersSection
            classData={initialClassData}
            isOwner={true}
          />

          <GroupSettingsSection
            classData={initialClassData}
            isOwner={true}
            onUpdated={handleUpdated}
          />

          <ProfileFieldsSection
            classData={initialClassData}
            isOwner={true}
          />

          <ProgressiveUnlockSection
            classData={initialClassData}
            isOwner={true}
            onUpdated={handleUpdated}
          />

          <ResetProgressSection
            classId={initialClassData.id}
            isOwner={true}
          />

          <DuplicateClassSection
            classData={initialClassData}
            isOwner={true}
            onDuplicated={handleUpdated}
          />

          <DangerZoneSection
            classData={initialClassData}
            isOwner={true}
          />
        </div>
      </div>
    </PageLayout>
  );
}
