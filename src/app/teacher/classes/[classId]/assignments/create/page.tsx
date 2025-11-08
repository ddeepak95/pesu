"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import AssignmentForm from "@/components/Teacher/Assignments/AssignmentForm";
import { useAuth } from "@/contexts/AuthContext";
import { createAssignment } from "@/lib/queries/assignments";
import { getClassByClassId } from "@/lib/queries/classes";

export default function CreateAssignmentPage() {
  const params = useParams();
  const { user } = useAuth();
  const classId = params.classId as string;

  const [error, setError] = useState<string | null>(null);
  const [classDbId, setClassDbId] = useState<string | null>(null);
  const [classLanguage, setClassLanguage] = useState<string>("en");
  const [loadingClass, setLoadingClass] = useState(true);

  // Fetch the class to get the database ID and preferred language
  useEffect(() => {
    const fetchClass = async () => {
      try {
        const classData = await getClassByClassId(classId);
        if (classData) {
          setClassDbId(classData.id);
          setClassLanguage(classData.preferred_language);
        } else {
          setError("Class not found");
        }
      } catch (err) {
        console.error("Error fetching class:", err);
        setError("Failed to load class");
      } finally {
        setLoadingClass(false);
      }
    };

    if (classId) {
      fetchClass();
    }
  }, [classId]);

  const handleSubmit = async (data: {
    title: string;
    questions: { order: number; prompt: string; total_points: number; rubric: { item: string; points: number }[]; supporting_content: string }[];
    totalPoints: number;
    preferredLanguage: string;
    isPublic: boolean;
  }) => {
    if (!user) {
      throw new Error("You must be logged in to create an assignment");
    }

    if (!classDbId) {
      throw new Error("Class not found");
    }

    await createAssignment(
      {
        class_id: classDbId,
        title: data.title,
        questions: data.questions,
        total_points: data.totalPoints,
        preferred_language: data.preferredLanguage,
        is_public: data.isPublic,
      },
      user.id
    );
  };

  if (loadingClass) {
    return (
      <PageLayout>
        <div className="p-8 text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </PageLayout>
    );
  }

  if (error && !classDbId) {
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
        <h1 className="text-3xl font-bold mb-8">Create Learning Assignment</h1>
        <AssignmentForm
          mode="create"
          classId={classId}
          initialLanguage={classLanguage}
          onSubmit={handleSubmit}
        />
      </div>
    </PageLayout>
  );
}

