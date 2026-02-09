"use client";

import { useEffect, useState } from "react";
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
  // Profile dialog state
  const [showProfileDialog, setShowProfileDialog] = useState(false);

  // Use the profile hook to fetch fields and check completion
  const {
    fields: profileFields,
    responses: existingResponses,
    hasCompletedRequired,
    loading: profileLoading,
    refetch,
  } = useStudentProfile(classData.id, userId);

  // Show profile dialog if mandatory fields are not completed
  useEffect(() => {
    if (profileLoading) return;

    if (profileFields.length > 0 && !hasCompletedRequired) {
      setShowProfileDialog(true);
    } else {
      setShowProfileDialog(false);
    }
  }, [profileLoading, profileFields, hasCompletedRequired]);

  const handleProfileComplete = () => {
    setShowProfileDialog(false);
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
