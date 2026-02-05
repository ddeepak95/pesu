"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import GeneralSettingsSection from "@/components/Teacher/Classes/Settings/GeneralSettingsSection";
import ManageTeachersSection from "@/components/Teacher/Classes/Settings/ManageTeachersSection";
import GroupSettingsSection from "@/components/Teacher/Classes/Settings/GroupSettingsSection";
import ProfileFieldsSection from "@/components/Teacher/Classes/Settings/ProfileFieldsSection";
import ProgressiveUnlockSection from "@/components/Teacher/Classes/Settings/ProgressiveUnlockSection";
import ResetProgressSection from "@/components/Teacher/Classes/Settings/ResetProgressSection";
import DangerZoneSection from "@/components/Teacher/Classes/Settings/DangerZoneSection";
import { useAuth } from "@/contexts/AuthContext";
import { getClassByClassId } from "@/lib/queries/classes";
import { Class } from "@/types/class";

export default function ClassSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const classId = params.classId as string;
  const [classData, setClassData] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isOwner = !!(user && classData && user.id === classData.created_by);

  const fetchClass = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getClassByClassId(classId);
      if (!data) {
        setError("Class not found");
      } else {
        setClassData(data);
      }
    } catch (err) {
      console.error("Error fetching class:", err);
      setError("Failed to load class details");
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    if (classId) {
      fetchClass();
    }
  }, [classId, fetchClass]);

  useEffect(() => {
    if (classData && user && !isOwner) {
      router.replace(`/teacher/classes/${classId}`);
    }
  }, [classData, user, isOwner, router, classId]);

  if (authLoading || !user) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </PageLayout>
    );
  }

  if (loading) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-muted-foreground">Loading class settings...</p>
        </div>
      </PageLayout>
    );
  }

  if (error || !classData) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-destructive">{error || "Class not found"}</p>
        </div>
      </PageLayout>
    );
  }

  if (!isOwner) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-muted-foreground">Access denied. Redirecting...</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div>
        <div className="mb-4">
          <BackButton href={`/teacher/classes/${classId}`} />
        </div>
        <h1 className="text-3xl font-bold mb-2">{classData.name}</h1>
        <p className="text-muted-foreground mb-8">
          Manage settings for this class.
        </p>

        <div className="space-y-6">
          <GeneralSettingsSection
            classData={classData}
            isOwner={isOwner}
            onUpdated={fetchClass}
          />

          <ManageTeachersSection
            classData={classData}
            isOwner={isOwner}
          />

          <GroupSettingsSection
            classData={classData}
            isOwner={isOwner}
            onUpdated={fetchClass}
          />

          <ProfileFieldsSection
            classData={classData}
            isOwner={isOwner}
          />

          <ProgressiveUnlockSection
            classData={classData}
            isOwner={isOwner}
            onUpdated={fetchClass}
          />

          <ResetProgressSection
            classId={classData.id}
            isOwner={isOwner}
          />

          <DangerZoneSection
            classData={classData}
            isOwner={isOwner}
          />
        </div>
      </div>
    </PageLayout>
  );
}
