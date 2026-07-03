"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import AssignmentForm from "@/components/Teacher/Assignments/AssignmentForm";
import { useAuth } from "@/contexts/AuthContext";
import { createAssignment, updateAssignment } from "@/lib/queries/assignments";
import { getClassByClassId } from "@/lib/queries/classes";
import {
  createContentItem,
  updateContentItemStatusByRef,
} from "@/lib/queries/contentItems";
import type { AssignmentFormSubmitData } from "@/components/Teacher/Assignments/AssignmentForm";
import type { Assignment } from "@/types/assignment";
import { getClassGroups } from "@/lib/queries/groups";
import type { ClassLanguageConfig } from "@/types/class";

export default function CreateAssignmentPage() {
  const params = useParams();
  const router = useTrackedRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const classId = params.classId as string;

  const [error, setError] = useState<string | null>(null);
  const [classDbId, setClassDbId] = useState<string | null>(null);
  const [classGroupId, setClassGroupId] = useState<string | null>(null);
  // DB id of the draft created by "Save and Preview"; reused so repeat previews
  // update the same draft instead of creating duplicates.
  const [previewAssignmentDbId, setPreviewAssignmentDbId] = useState<
    string | null
  >(null);
  const [classLanguage, setClassLanguage] = useState<string>("en");
  const [classLanguageConfig, setClassLanguageConfig] =
    useState<ClassLanguageConfig | null>(null);
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
          setClassLanguageConfig(classData.language_config ?? null);
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

  const handleSubmit = async (data: AssignmentFormSubmitData) => {
    if (!user) {
      throw new Error("You must be logged in to create an assignment");
    }

    if (!classDbId || !classGroupId) {
      throw new Error("Class not found");
    }

    const status = data.isDraft ? "draft" : "active";

    // If a draft was already created via "Save and Preview", finalize that same
    // row instead of creating a duplicate.
    if (previewAssignmentDbId) {
      const updated = await updateAssignment(previewAssignmentDbId, {
        ...buildAssignmentFields(data),
        status,
      });
      await updateContentItemStatusByRef({
        class_id: classDbId,
        type: "formative_assignment",
        ref_id: previewAssignmentDbId,
        status: updated.status,
      });
      return;
    }

    const assignment = await createAssignment(
      {
        class_id: classDbId,
        class_group_id: classGroupId,
        ...buildAssignmentFields(data),
        status,
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
        status,
      },
      user.id
    );
  };

  // Shared field mapping for create / update / preview saves (status handled by caller).
  const buildAssignmentFields = (data: AssignmentFormSubmitData) => ({
    title: data.title,
    questions: data.questions,
    total_points: data.totalPoints,
    preferred_language: data.preferredLanguage,
    lock_language: data.lockLanguage,
    is_public: data.isPublic,
    activity_type: data.activityType,
    activity_template_id: data.activityTemplateId ?? null,
    activity_definition_snapshot: data.activityDefinitionSnapshot ?? null,
    template_synced_at: data.templateSyncedAt ?? new Date().toISOString(),
    assessment_mode: data.assessmentMode,
    responder_fields_config: data.responderFieldsConfig,
    max_attempts: data.maxAttempts ?? 1,
    bot_prompt_config: data.botPromptConfig,
    student_instructions: data.studentInstructions,
    show_rubric: data.showRubric ?? false,
    show_rubric_points: data.showRubricPoints ?? true,
    use_star_display: data.useStarDisplay ?? false,
    star_scale: data.starScale ?? 5,
    require_all_attempts: data.requireAllAttempts ?? false,
    shared_context_enabled: data.sharedContextEnabled ?? false,
    shared_context: data.sharedContext,
    evaluation_prompt: data.evaluationPrompt,
    feedback_focus: data.feedbackFocus?.length ? data.feedbackFocus : null,
    experience_rating_enabled: data.experienceRatingEnabled ?? false,
    experience_rating_required: data.experienceRatingRequired ?? false,
    feedback_requires_approval: data.feedbackRequiresApproval ?? false,
    batch_grade_release: data.batchGradeRelease ?? false,
    allow_copy_paste: data.allowCopyPaste ?? false,
    tab_switch_policy: data.tabSwitchPolicy ?? "warn",
    tab_switch_max_leaves:
      data.tabSwitchPolicy === "block_after_threshold"
        ? data.tabSwitchMaxLeaves ?? null
        : null,
    file_submission_config: data.fileSubmissionConfig ?? null,
    dynamic_questions_enabled: data.dynamicQuestionsEnabled ?? false,
    dynamic_question_focuses: null,
    dynamic_generation_prompt: data.dynamicGenerationPrompt ?? null,
  });

  // Save-and-preview: create the activity as a draft on first use (plus its content
  // item), then update that same draft on subsequent previews. Never navigates.
  const handleSaveForPreview = async (
    data: AssignmentFormSubmitData
  ): Promise<Assignment> => {
    if (!user) {
      throw new Error("You must be logged in to create an assignment");
    }
    if (!classDbId || !classGroupId) {
      throw new Error("Class not found");
    }

    const fields = buildAssignmentFields(data);

    if (previewAssignmentDbId) {
      // Update the existing draft, preserving its draft status (omit status).
      return updateAssignment(previewAssignmentDbId, fields);
    }

    const assignment = await createAssignment(
      {
        class_id: classDbId,
        class_group_id: classGroupId,
        ...fields,
        status: "draft",
      },
      user.id
    );

    await createContentItem(
      {
        class_id: classDbId,
        class_group_id: classGroupId,
        type: "formative_assignment",
        ref_id: assignment.id,
        status: "draft",
      },
      user.id
    );

    setPreviewAssignmentDbId(assignment.id);
    return assignment;
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
          <BackButton />
        </div>
        <h1 className="text-3xl font-bold mb-8">Create Learning Assignment</h1>
        <AssignmentForm
          mode="create"
          classId={classId}
          classDbId={classDbId}
          classLanguageConfig={classLanguageConfig}
          initialLanguage={classLanguage}
          initialLockLanguage={classLanguageConfig?.lockPrimaryLanguage ?? false}
          onSubmit={handleSubmit}
          onSaveForPreview={handleSaveForPreview}
          onCancel={() => router.push(backToContentHref)}
        />
      </div>
    </PageLayout>
  );
}
