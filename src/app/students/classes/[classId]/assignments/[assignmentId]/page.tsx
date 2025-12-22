"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import { getAssignmentById } from "@/lib/queries/assignments";
import { Assignment } from "@/types/assignment";
import { useAuth } from "@/contexts/AuthContext";
import StudentAssignmentResponse from "@/components/Student/StudentAssignmentResponse";

export default function StudentAssignmentPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const classId = params.classId as string;
  const assignmentId = params.assignmentId as string;

  const [assignmentData, setAssignmentData] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");

  const fetchAssignment = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getAssignmentById(assignmentId);
      if (!data) {
        setError("Assignment not found");
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

  useEffect(() => {
    if (assignmentId) {
      fetchAssignment();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  if (loading) {
    return (
      <PageLayout>
        <div className="p-8 text-center">
          <p className="text-muted-foreground">Loading assignment details...</p>
        </div>
      </PageLayout>
    );
  }

  if (error || !assignmentData) {
    return (
      <PageLayout>
        <div className="p-8 text-center">
          <p className="text-destructive">{error || "Assignment not found"}</p>
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
      <div className="p-8">
        <div className="mb-4">
          <BackButton href={`/students/classes/${classId}`} />
        </div>
        <div className="w-full">
          <StudentAssignmentResponse
            assignmentData={assignmentData}
            assignmentId={assignmentId}
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

