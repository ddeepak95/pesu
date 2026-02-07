"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import AssignmentForm from "@/components/Teacher/Assignments/AssignmentForm";
import { useAuth } from "@/contexts/AuthContext";
import { createAssignment } from "@/lib/queries/assignments";
import { getClassByClassId } from "@/lib/queries/classes";
import { createContentItem } from "@/lib/queries/contentItems";
import { getClassGroups } from "@/lib/queries/groups";
import { ResponderFieldConfig, BotPromptConfig } from "@/types/assignment";

export default function CreateAssignmentPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const classId = params.classId as string;

  const [error, setError] = useState<string | null>(null);
  const [classDbId, setClassDbId] = useState<string | null>(null);
  const [classGroupId, setClassGroupId] = useState<string | null>(null);
  const [classLanguage, setClassLanguage] = useState<string>("en");
  const [loadingClass, setLoadingClass] = useState(true);

  const backToContentHref = useMemo(() => {
    const groupId = searchParams.get("groupId");
    return groupId
      ? `/teacher/classes/${classId}?tab=content&groupId=${groupId}`
      : `/teacher/classes/${classId}?tab=content`;
  }, [classId, searchParams]);

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

  useEffect(() => {
    const initGroup = async () => {
      if (!classDbId) return;
      const fromUrl = searchParams.get("groupId");
      if (fromUrl) {
        setClassGroupId(fromUrl);
        return;
      }
      try {
        const groups = await getClassGroups(classDbId);
        setClassGroupId(groups[0]?.id ?? null);
      } catch (err) {
        console.error("Error loading class groups:", err);
        setClassGroupId(null);
      }
    };
    initGroup();
  }, [classDbId, searchParams]);

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
    lockLanguage: boolean;
    isPublic: boolean;
    assessmentMode: "voice" | "text_chat" | "static_text";
    isDraft: boolean;
    responderFieldsConfig?: ResponderFieldConfig[];
    maxAttempts?: number;
    botPromptConfig?: BotPromptConfig;
    studentInstructions?: string;
    showRubric?: boolean;
    showRubricPoints?: boolean;
    useStarDisplay?: boolean;
    starScale?: number;
    requireAllAttempts?: boolean;
  }) => {
    if (!user) {
      throw new Error("You must be logged in to create an assignment");
    }

    if (!classDbId || !classGroupId) {
      throw new Error("Class not found");
    }

    const assignment = await createAssignment(
      {
        class_id: classDbId,
        class_group_id: classGroupId,
        title: data.title,
        questions: data.questions,
        total_points: data.totalPoints,
        preferred_language: data.preferredLanguage,
        lock_language: data.lockLanguage,
        is_public: data.isPublic,
        assessment_mode: data.assessmentMode,
        status: data.isDraft ? "draft" : "active",
        responder_fields_config: data.responderFieldsConfig,
        max_attempts: data.maxAttempts ?? 1,
        bot_prompt_config: data.botPromptConfig,
        student_instructions: data.studentInstructions,
        show_rubric: data.showRubric ?? true,
        show_rubric_points: data.showRubricPoints ?? true,
        use_star_display: data.useStarDisplay ?? false,
        star_scale: data.starScale ?? 5,
        require_all_attempts: data.requireAllAttempts ?? false,
      },
      user.id
    );

    // Insert into the unified content feed
    await createContentItem(
      {
        class_id: classDbId,
        class_group_id: classGroupId,
        type: "formative_assignment",
        ref_id: assignment.id,
        status: data.isDraft ? "draft" : "active",
      },
      user.id
    );
  };

  if (loadingClass) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </PageLayout>
    );
  }

  if (error && (!classDbId || !classGroupId)) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-destructive">{error}</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div>
        <div className="mb-4">
          <BackButton href={backToContentHref} />
        </div>
        <h1 className="text-3xl font-bold mb-8">Create Learning Assignment</h1>
        <AssignmentForm
          mode="create"
          classId={classId}
          initialLanguage={classLanguage}
          onSubmit={handleSubmit}
        />
        <div className="mt-6 flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(backToContentHref)}
          >
            Cancel
          </Button>
        </div>
      </div>
    </PageLayout>
  );
}
