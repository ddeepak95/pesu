"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import AssignmentForm from "@/components/Teacher/Assignments/AssignmentForm";
import { useAuth } from "@/contexts/AuthContext";
import { getAssignmentById, updateAssignment } from "@/lib/queries/assignments";
import { Question } from "@/types/assignment";

export default function EditAssignmentPage() {
  const params = useParams();
  const { user } = useAuth();
  const classId = params.classId as string;
  const assignmentId = params.assignmentId as string;

  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [preferredLanguage, setPreferredLanguage] = useState("en");
  const [error, setError] = useState<string | null>(null);
  const [assignmentDbId, setAssignmentDbId] = useState<string | null>(null);
  const [loadingAssignment, setLoadingAssignment] = useState(true);

  // Fetch assignment data
  useEffect(() => {
    const fetchAssignment = async () => {
      setLoadingAssignment(true);
      try {
        const assignmentData = await getAssignmentById(assignmentId);
        if (assignmentData) {
          setTitle(assignmentData.title);
          setQuestions(assignmentData.questions);
          setPreferredLanguage(assignmentData.preferred_language);
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
        <h1 className="text-3xl font-bold mb-8">Edit Assignment</h1>
        <AssignmentForm
          mode="edit"
          classId={classId}
          assignmentId={assignmentId}
          initialTitle={title}
          initialQuestions={questions}
          initialLanguage={preferredLanguage}
          onSubmit={handleSubmit}
        />
      </div>
    </PageLayout>
  );
}
