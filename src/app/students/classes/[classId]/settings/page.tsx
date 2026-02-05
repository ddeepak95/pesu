"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import StudentProfileForm from "@/components/Student/Classes/StudentProfileForm";
import { useAuth } from "@/contexts/AuthContext";
import { getClassByClassId } from "@/lib/queries/classes";
import { Class } from "@/types/class";
import { useStudentProfile } from "@/hooks/useStudentProfile";

export default function StudentSettingsPage() {
  const params = useParams();
  const { user, loading: authLoading } = useAuth();
  const classId = params.classId as string;
  const [classData, setClassData] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const {
    fields: profileFields,
    responses: existingResponses,
    loading: profileLoading,
    refetch: refetchProfile,
  } = useStudentProfile(classData?.id ?? "", user?.id ?? "");

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
          <p className="text-muted-foreground">Loading settings...</p>
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

  return (
    <PageLayout>
      <div>
        <div className="mb-4">
          <BackButton href={`/students/classes/${classId}`} />
        </div>
        <h1 className="text-3xl font-bold mb-2">{classData.name}</h1>
        <p className="text-muted-foreground mb-8">
          Manage your settings for this class.
        </p>

        <div className="space-y-6">
          {profileLoading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Loading profile...</p>
            </div>
          ) : (
            <StudentProfileForm
              classDbId={classData.id}
              studentId={user.id}
              fields={profileFields}
              existingResponses={existingResponses}
              onSaved={refetchProfile}
            />
          )}
        </div>
      </div>
    </PageLayout>
  );
}
