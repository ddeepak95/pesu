"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import AssignmentForm from "@/components/Teacher/Assignments/AssignmentForm";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAssignmentByIdForTeacher,
  updateAssignment,
} from "@/lib/queries/assignments";
import { Question } from "@/types/assignment";

export default function EditAssignmentPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const classId = params.classId as string;
  const assignmentId = params.assignmentId as string;

  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [preferredLanguage, setPreferredLanguage] = useState("en");
  const [isPublic, setIsPublic] = useState(false);
  const [assessmentMode, setAssessmentMode] = useState<
    "voice" | "text_chat" | "static_text"
  >("voice");
  const [error, setError] = useState<string | null>(null);
  const [assignmentDbId, setAssignmentDbId] = useState<string | null>(null);
  const [loadingAssignment, setLoadingAssignment] = useState(true);

  // Fetch assignment data
  useEffect(() => {
    const fetchAssignment = async () => {
      setLoadingAssignment(true);
      try {
        const assignmentData = await getAssignmentByIdForTeacher(assignmentId);
        if (assignmentData) {
          setTitle(assignmentData.title);
          setQuestions(assignmentData.questions);
          setPreferredLanguage(assignmentData.preferred_language);
          setIsPublic(assignmentData.is_public);
          setAssessmentMode(assignmentData.assessment_mode ?? "voice");
          setAssignmentDbId(assignmentData.id);
        } else {
          setError("Assignment not found");
        }
      } catch (err) {
        console.error("Error fetching assignment:", err);
        setError("Failed to load assignment");
      } finally {
        setLoadingAssignment(false);
      }
    };

    if (assignmentId) {
      fetchAssignment();
    }
  }, [assignmentId]);

  const handleSubmit = async (data: {
    title: string;
    questions: {
      order: number;
      prompt: string;
      total_points: number;
      rubric: { item: string; points: number }[];
      supporting_content: string;
    }[];
    totalPoints: number;
    preferredLanguage: string;
    isPublic: boolean;
    assessmentMode: "voice" | "text_chat" | "static_text";
    isDraft: boolean;
  }) => {
    if (!user) {
      throw new Error("You must be logged in to update an assignment");
    }

    if (!assignmentDbId) {
      throw new Error("Assignment not found");
    }

    await updateAssignment(assignmentDbId, {
      title: data.title,
      questions: data.questions,
      total_points: data.totalPoints,
      preferred_language: data.preferredLanguage,
      is_public: data.isPublic,
      assessment_mode: data.assessmentMode,
    });
  };

  if (loadingAssignment) {
    return (
      <PageLayout>
        <div className="p-8 text-center">
          <p className="text-muted-foreground">Loading assignment...</p>
        </div>
      </PageLayout>
    );
  }

  if (error && !assignmentDbId) {
    return (
      <PageLayout>
        <div className="p-8 text-center">
          <p className="text-destructive">{error}</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto p-8">
        <div className="mb-4">
          <BackButton />
        </div>
        <h1 className="text-3xl font-bold mb-8">Edit Assignment</h1>
        <AssignmentForm
          mode="edit"
          classId={classId}
          assignmentId={assignmentId}
          initialTitle={title}
          initialQuestions={questions}
          initialLanguage={preferredLanguage}
          initialIsPublic={isPublic}
          initialAssessmentMode={assessmentMode}
          onSubmit={handleSubmit}
        />

        <div className="mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const qs = searchParams.toString();
              router.push(
                `/teacher/classes/${classId}/assignments/${assignmentId}${
                  qs ? `?${qs}` : ""
                }`
              );
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    </PageLayout>
  );
}
