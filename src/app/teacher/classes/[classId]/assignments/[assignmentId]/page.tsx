"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAssignmentByIdForTeacher,
  deleteAssignment,
} from "@/lib/queries/assignments";
import { Assignment } from "@/types/assignment";
import QuestionView from "@/components/Shared/QuestionView";
import { supportedLanguages } from "@/utils/supportedLanguages";
import SubmissionsTab from "@/components/Teacher/Assignments/SubmissionsTab";

export default function AssignmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const classId = params.classId as string;
  const assignmentId = params.assignmentId as string;
  const [assignmentData, setAssignmentData] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAssignment = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getAssignmentByIdForTeacher(assignmentId);
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

  const handleEdit = () => {
    const qs = searchParams.toString();
    router.push(
      `/teacher/classes/${classId}/assignments/${assignmentId}/edit${
        qs ? `?${qs}` : ""
      }`
    );
  };

  const handleDelete = async () => {
    if (!user || !assignmentData) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this assignment? This action cannot be undone."
    );

    if (!confirmed) return;

    try {
      console.log("Deleting assignment:", {
        id: assignmentData.id,
        assignment_id: assignmentData.assignment_id,
        class_id: assignmentData.class_id,
      });
      await deleteAssignment(assignmentData.id, assignmentData.class_id);
      router.push(`/teacher/classes/${classId}`);
    } catch (err) {
      console.error("Error deleting assignment:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to delete assignment. Please try again.";
      alert(errorMessage);
    }
  };

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

  return (
    <PageLayout>
      <div className="border-b">
        <div className="p-8 pb-0">
          <div className="mb-4">
            <BackButton />
          </div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold">{assignmentData.title}</h1>
              <div className="flex items-center gap-4 mt-1 text-muted-foreground">
                <p>{assignmentData.total_points} points total</p>
                <span>•</span>
                <p>
                  Language:{" "}
                  {supportedLanguages.find(
                    (lang) => lang.code === assignmentData.preferred_language
                  )?.name || assignmentData.preferred_language}
                </p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Options</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleEdit}>Edit</DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive"
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Tabs defaultValue="questions" className="w-full">
            <TabsList>
              <TabsTrigger value="questions">Questions</TabsTrigger>
              <TabsTrigger value="submissions">Submissions</TabsTrigger>
            </TabsList>

            <TabsContent value="questions" className="space-y-4 py-6">
              {assignmentData.questions
                .sort((a, b) => a.order - b.order)
                .map((question, index) => (
                  <QuestionView key={index} question={question} index={index} />
                ))}
            </TabsContent>

            <TabsContent value="submissions" className="py-6">
              <SubmissionsTab
                assignmentId={assignmentData.assignment_id}
                classId={classId}
                isPublic={assignmentData.is_public}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PageLayout>
  );
}
