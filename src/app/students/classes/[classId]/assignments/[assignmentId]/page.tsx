"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import { getAssignmentById } from "@/lib/queries/assignments";
import { Assignment } from "@/types/assignment";
import { useAuth } from "@/contexts/AuthContext";
import StudentAssignmentResponse from "@/components/Student/StudentAssignmentResponse";
import {
  getContentItemByRefId,
  getContentItemsByGroup,
} from "@/lib/queries/contentItems";
import { getClassByClassId } from "@/lib/queries/classes";
import { getStudentGroupForClass } from "@/lib/queries/groups";
import { getCompletionsForStudent } from "@/lib/queries/contentCompletions";
import { getUnlockState } from "@/lib/utils/unlockLogic";
import { ContentItem } from "@/types/contentItem";

export default function StudentAssignmentPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const classId = params.classId as string;
  const assignmentId = params.assignmentId as string;

  const [assignmentData, setAssignmentData] = useState<Assignment | null>(null);
  const [contentItemId, setContentItemId] = useState<string | null>(null);
  const [contentItem, setContentItem] = useState<ContentItem | null>(null);
  const [isContentLocked, setIsContentLocked] = useState<boolean>(false);
  const [lockReason, setLockReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [classUuid, setClassUuid] = useState<string | null>(null);

  const fetchAssignment = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getAssignmentById(assignmentId);
      if (!data) {
        setError("Assignment not found");
        return;
      }
      setAssignmentData(data);

      // Fetch content item for completion tracking and unlock checking
      const fetchedContentItem = await getContentItemByRefId(
        data.id,
        "formative_assignment"
      );
      if (fetchedContentItem) {
        setContentItemId(fetchedContentItem.id);
        setContentItem(fetchedContentItem);

        // Check unlock status if user is authenticated
        if (user) {
          try {
            // Get class data to check progressive unlock setting
            const classData = await getClassByClassId(classId);
            if (classData?.id) {
              setClassUuid(classData.id);
            }
            if (classData?.enable_progressive_unlock) {
              // Get student's group
              const groupId = await getStudentGroupForClass(
                classData.id,
                user.id
              );

              // Skip unlock check if student is not assigned to a group
              if (!groupId) {
                return;
              }

              // Get all content items in the group
              const allContentItems = await getContentItemsByGroup({
                classDbId: classData.id,
                classGroupId: groupId,
              });

              // Get completions
              const contentItemIds = allContentItems.map((item) => item.id);
              const completedIds = await getCompletionsForStudent(
                contentItemIds
              );

              // Calculate unlock state for this specific content item
              const unlockState = getUnlockState(
                fetchedContentItem.id,
                allContentItems,
                completedIds,
                true
              );

              if (unlockState && unlockState.isLocked) {
                setIsContentLocked(true);
                setLockReason(unlockState.lockReason);
              }
            }
          } catch (unlockErr) {
            console.error("Error checking unlock status:", unlockErr);
            // Don't block access if there's an error checking unlock status
          }
        }
      }
    } catch (err) {
      console.error("Error fetching assignment:", err);
      setError("Failed to load assignment details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (assignmentId) {
      fetchAssignment();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  if (loading) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-muted-foreground">Loading assignment details...</p>
        </div>
      </PageLayout>
    );
  }

  if (error || !assignmentData) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-destructive">{error || "Assignment not found"}</p>
        </div>
      </PageLayout>
    );
  }

  if (isContentLocked) {
    return (
      <PageLayout userName={displayName}>
        <div>
          <div className="mb-4">
            <BackButton />
          </div>
          <div className="text-center py-12">
            <div className="inline-block p-4 rounded-full bg-muted mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-12 w-12 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2">Content Locked</h2>
            <p className="text-muted-foreground mb-4">{lockReason}</p>
            <BackButton />
          </div>
        </div>
      </PageLayout>
    );
  }

  const studentName =
    user?.user_metadata?.display_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "";

  return (
    <PageLayout userName={displayName || studentName}>
      <div>
        <div className="mb-4">
          <BackButton />
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
            onBack={() => router.push(`/students/classes/${classId}`)}
            onDisplayNameChange={setDisplayName}
          />
        </div>
      </div>
    </PageLayout>
  );
}
