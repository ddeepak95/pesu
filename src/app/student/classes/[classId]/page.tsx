"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageLayout from "@/components/PageLayout";
import Content from "@/components/Student/Classes/Content";
import ProfileDetailsDialog from "@/components/Student/Classes/ProfileDetailsDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { getClassByClassId } from "@/lib/queries/classes";
import { Class } from "@/types/class";
import { useStudentProfile } from "@/hooks/useStudentProfile";
import { Settings } from "lucide-react";

export default function ClassDetailPage() {
  const params = useParams();
  const { user, loading: authLoading } = useAuth();
  const classId = params.classId as string;
  const [classData, setClassData] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Profile dialog state
  const [showProfileDialog, setShowProfileDialog] = useState(false);

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

  // Use the profile hook to fetch fields and check completion
  const {
    fields: profileFields,
    responses: existingResponses,
    hasCompletedRequired,
    loading: profileLoading,
  } = useStudentProfile(classData?.id ?? "", user?.id ?? "");

  // Show profile dialog if mandatory fields are not completed
  useEffect(() => {
    if (profileLoading || !classData || !user) return;

    if (profileFields.length > 0 && !hasCompletedRequired) {
      setShowProfileDialog(true);
    }
  }, [profileLoading, classData, user, profileFields, hasCompletedRequired]);

  const handleProfileComplete = () => {
    setShowProfileDialog(false);
  };

  // Show loading while checking auth (middleware handles redirect if not authenticated)
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
          <p className="text-muted-foreground">Loading class details...</p>
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
      {/* Profile details dialog - shows if student hasn't completed required fields */}
      {profileFields.length > 0 && (
        <ProfileDetailsDialog
          classDbId={classData.id}
          className={classData.name}
          studentId={user.id}
          fields={profileFields}
          existingResponses={existingResponses}
          open={showProfileDialog}
          onComplete={handleProfileComplete}
        />
      )}

      <div>
        <div>
          <div className="mb-4">
            <Button variant="link" asChild className="p-0">
              <Link href="/student/classes">&larr; All Classes</Link>
            </Button>
          </div>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold">{classData.name}</h1>
            <Button variant="outline" className="gap-2" asChild>
              <Link href={`/student/classes/${classId}/settings`}>
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </Button>
          </div>

          <Content classData={classData} />
        </div>
      </div>
    </PageLayout>
  );
}
