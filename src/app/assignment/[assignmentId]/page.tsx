"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import { getAssignmentById } from "@/lib/queries/assignments";
import { Assignment } from "@/types/assignment";
import PublicAssignmentResponse from "@/components/Public/PublicAssignmentResponse";

export default function PublicAssignmentPage() {
  const params = useParams();
  const assignmentId = params.assignmentId as string;

  const [assignmentData, setAssignmentData] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");

  useEffect(() => {
    fetchAssignment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  const fetchAssignment = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAssignmentById(assignmentId);
      if (!data) {
        // Since RLS blocks non-public assignments for anonymous users with same error as "not found",
        // we show a message that covers both cases
        setError(
          "Assignment not found or not publicly accessible. If you have a link from your teacher, please ensure the assignment is set as public."
        );
      } else if (!data.is_public) {
        // This case only applies to authenticated users who can see non-public assignments
        setError(
          "This assignment is not publicly accessible. Please contact your teacher for access."
        );
      } else {
        setAssignmentData(data);
      }
    } catch (err) {
      console.error("Error fetching assignment:", err);
      setError("Failed to load assignment details");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Loading assignment...</p>
        </div>
      </PageLayout>
    );
  }

  if (error || !assignmentData) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-destructive">{error || "Assignment not found"}</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout userName={displayName}>
      <div className="p-8">
        <PublicAssignmentResponse
          assignmentData={assignmentData}
          assignmentId={assignmentId}
          onDisplayNameChange={setDisplayName}
        />
      </div>
    </PageLayout>
  );
}
