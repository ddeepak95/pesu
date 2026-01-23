"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import { getAssignmentById } from "@/lib/queries/assignments";
import { Assignment } from "@/types/assignment";
import PublicAssignmentResponse, {
  PublicAssignmentResponseRef,
} from "@/components/Public/PublicAssignmentResponse";

export default function PublicAssignmentPage() {
  const params = useParams();
  const assignmentId = params.assignmentId as string;

  const router = useRouter();
  const searchParams = useSearchParams();

  // ✅ URL-driven tab (THIS IS THE ISSUE FIX)
  const activeTab = searchParams.get("tab") || "details";

  const [assignmentData, setAssignmentData] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [hasActiveSubmission, setHasActiveSubmission] = useState(false);

  const assignmentResponseRef =
    useRef<PublicAssignmentResponseRef>(null);

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
        setError(
          "Assignment not found or not publicly accessible. If you have a link from your teacher, please ensure the assignment is set as public."
        );
      } else if (!data.is_public) {
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

  const changeTab = (tab: "details" | "submissions") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`?${params.toString()}`);
  };

  const handleLogoutSubmission = () => {
    if (assignmentResponseRef.current) {
      assignmentResponseRef.current.resetSubmission();
      setHasActiveSubmission(false);
    }
  };

  const handleSubmissionStateChange = (hasActive: boolean) => {
    setHasActiveSubmission(hasActive);
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

  return (
    <PageLayout
      userName={displayName}
      onLogoutSubmission={
        hasActiveSubmission ? handleLogoutSubmission : undefined
      }
    >
      <div className="p-8">
        {/* ✅ TABS (URL-DRIVEN) */}
        <div className="mb-6 flex gap-6 border-b">
          <button
            onClick={() => changeTab("details")}
            className={`pb-2 ${
              activeTab === "details"
                ? "border-b-2 border-primary font-semibold"
                : "text-muted-foreground"
            }`}
          >
            Details
          </button>

          <button
            onClick={() => changeTab("submissions")}
            className={`pb-2 ${
              activeTab === "submissions"
                ? "border-b-2 border-primary font-semibold"
                : "text-muted-foreground"
            }`}
          >
            Submissions
          </button>
        </div>

        {/* ✅ CONTENT BASED ON URL */}
        {error || !assignmentData ? (
          <p className="text-destructive">{error}</p>
        ) : activeTab === "submissions" ? (
          <div className="text-muted-foreground">
            <p>Submissions will appear here.</p>
          </div>
        ) : (
          <PublicAssignmentResponse
            ref={assignmentResponseRef}
            assignmentData={assignmentData}
            assignmentId={assignmentId}
            onDisplayNameChange={setDisplayName}
            onSubmissionStateChange={handleSubmissionStateChange}
          />
        )}
      </div>
    </PageLayout>
  );
}
