"use client";

import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import StudentProfileForm from "@/components/Student/Classes/StudentProfileForm";
import { useAuth } from "@/contexts/AuthContext";
import { Class } from "@/types/class";
import { useStudentProfile } from "@/hooks/useStudentProfile";

interface StudentSettingsClientProps {
  classData: Class;
}

export default function StudentSettingsClient({
  classData,
}: StudentSettingsClientProps) {
  const { user } = useAuth();

  const {
    fields: profileFields,
    responses: existingResponses,
    loading: profileLoading,
    refetch: refetchProfile,
  } = useStudentProfile(classData.id, user?.id ?? "");

  return (
    <PageLayout>
      <div>
        <div className="mb-4">
          <BackButton />
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
          ) : user ? (
            <StudentProfileForm
              classDbId={classData.id}
              studentId={user.id}
              fields={profileFields}
              existingResponses={existingResponses}
              onSaved={refetchProfile}
            />
          ) : null}
        </div>
      </div>
    </PageLayout>
  );
}
