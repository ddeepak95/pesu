"use client";

import { useState } from "react";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import PageLayout from "@/components/PageLayout";
import CloseButton from "@/components/ui/close-button";
import GoToClassButton from "@/components/ui/go-to-class-button";
import NextItemButton from "@/components/ui/next-item-button";
import { useAuth } from "@/contexts/AuthContext";
import StudentAssignmentResponse from "@/components/Student/StudentAssignmentResponse";
import { Assignment } from "@/types/assignment";
import { useComponentCloseTracking } from "@/hooks/useComponentCloseTracking";
import { useNavigationTracking } from "@/hooks/useNavigationTracking";

interface AssignmentDetailClientProps {
  assignmentData: Assignment;
  assignmentId: string;
  classId: string;
  contentItemId: string | null;
  classUuid: string | null;
}

export default function AssignmentDetailClient({
  assignmentData,
  assignmentId,
  classId,
  contentItemId,
  classUuid,
}: AssignmentDetailClientProps) {
  const router = useTrackedRouter();
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState<string>("");

  const studentName =
    user?.user_metadata?.display_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "";

  useComponentCloseTracking({
    componentType: "assignment",
    componentId: assignmentId,
    userId: user?.id,
    classId: classUuid ?? classId,
  });
  const { emitBack, emitClose, emitNextItem } = useNavigationTracking({
    componentType: "assignment",
    componentId: assignmentId,
    userId: user?.id,
    classId: classUuid ?? classId,
  });

  return (
    <PageLayout userName={displayName || studentName}>
      <div>
        <div className="mb-4">
          <GoToClassButton classId={classId} onBeforeNavigate={emitBack} />
        </div>
        <div className="w-full">
          <StudentAssignmentResponse
            assignmentData={assignmentData}
            assignmentId={assignmentId}
            classId={classUuid ?? classId}
            contentItemId={contentItemId}
            onComplete={() => {
              // Attempts are automatically saved, no action needed
            }}
            onBack={() =>
              router.push(`/student/classes/${classId}`, { scroll: false })
            }
            onDisplayNameChange={setDisplayName}
          />

          {contentItemId && (
            <>
              <hr className="my-6 border-border" />
              <NextItemButton
                classDbId={classUuid}
                classId={classId}
                contentItemId={contentItemId}
                className="pt-6"
                onBeforeNavigate={emitNextItem}
              />
            </>
          )}
          <CloseButton
            href={`/student/classes/${classId}`}
            className="pt-2 pb-8"
            onBeforeNavigate={emitClose}
          />
        </div>
      </div>
    </PageLayout>
  );
}
