"use client";

import { useEffect } from "react";
import Link from "next/link";
import PageLayout from "@/components/PageLayout";
import Content from "@/components/Student/Classes/Content";
import ProfileDetailsDialog from "@/components/Student/Classes/ProfileDetailsDialog";
import { Button } from "@/components/ui/button";
import { Class } from "@/types/class";
import { useStudentProfile } from "@/hooks/useStudentProfile";
import { Settings } from "lucide-react";

interface ClassDetailClientProps {
  classData: Class;
  userId: string;
  classId: string;
}

export default function ClassDetailClient({
  classData,
  userId,
  classId,
}: ClassDetailClientProps) {
  // Use the profile hook to fetch fields and check completion
  const {
    fields: profileFields,
    responses: existingResponses,
    hasCompletedRequired,
    loading: profileLoading,
    refetch,
  } = useStudentProfile(classData.id, userId);

  // Show profile dialog when there are required fields and they are not yet completed (derived, no effect)
  const showProfileDialog =
    !profileLoading && profileFields.length > 0 && !hasCompletedRequired;

  // Restore scroll position when navigating back from a content page
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`scroll_${classId}`);
      if (raw != null) {
        const y = Number(raw);
        sessionStorage.removeItem(`scroll_${classId}`);
        requestAnimationFrame(() => {
          setTimeout(() => window.scrollTo(0, y), 50);
        });
      }
    } catch {}
  }, [classId]);

  const handleProfileComplete = () => {
    refetch();
  };

  return (
    <PageLayout>
      {/* Profile details dialog - shows if student hasn't completed required fields */}
      {profileFields.length > 0 && (
        <ProfileDetailsDialog
          classDbId={classData.id}
          className={classData.name}
          studentId={userId}
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
