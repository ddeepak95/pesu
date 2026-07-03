"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import AssignmentForm from "@/components/Teacher/Assignments/AssignmentForm";
import { useAuth } from "@/contexts/AuthContext";
import { updateAssignment } from "@/lib/queries/assignments";
import { updateContentItemStatusByRef } from "@/lib/queries/contentItems";
import type { AssignmentFormSubmitData } from "@/components/Teacher/Assignments/AssignmentForm";
import type { Assignment } from "@/types/assignment";
import {
  Question,
  ResponderFieldConfig,
  BotPromptConfig,
  FileSubmissionConfig,
} from "@/types/assignment";
import type { ActivityType } from "@/lib/promptTemplates";
import type { TemplateDefinition } from "@/lib/activityTypes/templates";
import {
  parseFeedbackFocusAreas,
  type FeedbackFocusArea,
} from "@/lib/feedbackFocus";
import type { TabSwitchPolicy } from "@/lib/integrity/constants";
import { useAssignmentByIdForTeacher } from "@/hooks/swr";
import type { AssessmentMode } from "@/lib/settings/registry";

export default function EditAssignmentPage() {
  const params = useParams();
  const router = useTrackedRouter();
  const { user } = useAuth();
  const classId = params.classId as string;
  const assignmentId = params.assignmentId as string;

  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [preferredLanguage, setPreferredLanguage] = useState("en");
  const [lockLanguage, setLockLanguage] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [activityType, setActivityType] = useState<ActivityType>("learning");
  const [activityTemplateId, setActivityTemplateId] = useState<string | null>(
    null,
  );
  const [activityDefinition, setActivityDefinition] =
    useState<TemplateDefinition | null>(null);
  const [templateSyncedAt, setTemplateSyncedAt] = useState<string | null>(
    null,
  );
  const [assessmentMode, setAssessmentMode] =
    useState<AssessmentMode>("voice");
  const [responderFieldsConfig, setResponderFieldsConfig] = useState<
    ResponderFieldConfig[] | undefined
  >(undefined);
  const [maxAttempts, setMaxAttempts] = useState<number>(1);
  const [botPromptConfig, setBotPromptConfig] = useState<
    BotPromptConfig | undefined
  >(undefined);
  const [studentInstructions, setStudentInstructions] = useState<string>("");
  const [showRubric, setShowRubric] = useState<boolean>(true);
  const [showRubricPoints, setShowRubricPoints] = useState<boolean>(true);
  const [useStarDisplay, setUseStarDisplay] = useState<boolean>(false);
  const [starScale, setStarScale] = useState<number>(5);
  const [requireAllAttempts, setRequireAllAttempts] = useState<boolean>(false);
  const [sharedContextEnabled, setSharedContextEnabled] = useState<boolean>(false);
  const [sharedContext, setSharedContext] = useState<string>("");
  const [evaluationPrompt, setEvaluationPrompt] = useState<string>("");
  // undefined = never set on this assignment → AssignmentForm seeds activity-type defaults.
  const [feedbackFocus, setFeedbackFocus] = useState<
    FeedbackFocusArea[] | undefined
  >(undefined);
  const [experienceRatingEnabled, setExperienceRatingEnabled] = useState<boolean>(false);
  const [experienceRatingRequired, setExperienceRatingRequired] = useState<boolean>(false);
  const [feedbackRequiresApproval, setFeedbackRequiresApproval] = useState<boolean>(false);
  const [batchGradeRelease, setBatchGradeRelease] = useState<boolean>(false);
  const [allowCopyPaste, setAllowCopyPaste] = useState(false);
  const [tabSwitchPolicy, setTabSwitchPolicy] =
    useState<TabSwitchPolicy>("warn");
  const [tabSwitchMaxLeaves, setTabSwitchMaxLeaves] = useState(3);
  const [fileSubmissionConfig, setFileSubmissionConfig] =
    useState<FileSubmissionConfig | null>(null);
  const [dynamicGenerationPrompt, setDynamicGenerationPrompt] = useState<string>("");
  const [assignmentDbId, setAssignmentDbId] = useState<string | null>(null);
  const [assignmentClassId, setAssignmentClassId] = useState<string | null>(null);
  const [initialIsDraft, setInitialIsDraft] = useState(false);

  const assignmentQuery = useAssignmentByIdForTeacher(assignmentId);
  const assignmentData = assignmentQuery.data ?? null;
  const loadingAssignment = assignmentQuery.isLoading;
  const fetchError = assignmentQuery.error
    ? "Failed to load assignment"
    : !loadingAssignment && !assignmentData
      ? "Assignment not found"
      : null;

  // Seed editable form state once when the SWR data first arrives. Using the
  // "store information from previous render" pattern avoids cascading renders
  // flagged by `react-hooks/set-state-in-effect`.
  const [seededAssignmentRef, setSeededAssignmentRef] =
    useState<unknown>(null);
  if (assignmentData && seededAssignmentRef !== assignmentData) {
    setSeededAssignmentRef(assignmentData);
    setTitle(assignmentData.title);
    setQuestions(assignmentData.questions);
    setPreferredLanguage(assignmentData.preferred_language);
    setLockLanguage(assignmentData.lock_language ?? false);
    setIsPublic(assignmentData.is_public);
    setActivityType(assignmentData.activity_type ?? "learning");
    setActivityTemplateId(assignmentData.activity_template_id ?? null);
    setActivityDefinition(assignmentData.activity_definition_snapshot ?? null);
    setTemplateSyncedAt(assignmentData.template_synced_at ?? null);
    setAssessmentMode(assignmentData.assessment_mode ?? "voice");
    setResponderFieldsConfig(assignmentData.responder_fields_config);
    setMaxAttempts(assignmentData.max_attempts ?? 1);
    setBotPromptConfig(assignmentData.bot_prompt_config);
    setStudentInstructions(assignmentData.student_instructions ?? "");
    setShowRubric(assignmentData.show_rubric ?? true);
    setShowRubricPoints(assignmentData.show_rubric_points ?? true);
    setUseStarDisplay(assignmentData.use_star_display ?? false);
    setStarScale(assignmentData.star_scale ?? 5);
    setRequireAllAttempts(assignmentData.require_all_attempts ?? false);
    setSharedContextEnabled(assignmentData.shared_context_enabled ?? false);
    setSharedContext(assignmentData.shared_context ?? "");
    setEvaluationPrompt(assignmentData.evaluation_prompt ?? "");
    setFeedbackFocus(
      assignmentData.feedback_focus == null
        ? undefined
        : parseFeedbackFocusAreas(assignmentData.feedback_focus),
    );
    setExperienceRatingEnabled(
      assignmentData.experience_rating_enabled ?? false
    );
    setExperienceRatingRequired(
      assignmentData.experience_rating_required ?? false
    );
    setFeedbackRequiresApproval(
      assignmentData.feedback_requires_approval ?? false
    );
    setBatchGradeRelease(assignmentData.batch_grade_release ?? false);
    setAllowCopyPaste(assignmentData.allow_copy_paste ?? false);
    setTabSwitchPolicy(assignmentData.tab_switch_policy ?? "warn");
    setTabSwitchMaxLeaves(assignmentData.tab_switch_max_leaves ?? 3);
    setFileSubmissionConfig(assignmentData.file_submission_config ?? null);
    setDynamicGenerationPrompt(
      assignmentData.dynamic_generation_prompt ?? ""
    );
    setAssignmentDbId(assignmentData.id);
    setAssignmentClassId(assignmentData.class_id);
    setInitialIsDraft(assignmentData.status === "draft");
  }

  const handleSubmit = async (data: AssignmentFormSubmitData) => {
    if (!user) {
      throw new Error("You must be logged in to update an assignment");
    }

    if (!assignmentDbId) {
      throw new Error("Assignment not found");
    }

    const newStatus = data.isDraft ? "draft" : "active";

    const updated = await updateAssignment(assignmentDbId, {
      ...buildAssignmentFields(data),
      status: newStatus,
    });

    // Sync content_item status
    if (assignmentClassId) {
      await updateContentItemStatusByRef({
        class_id: assignmentClassId,
        type: "formative_assignment",
        ref_id: assignmentDbId,
        status: updated.status,
      });
    }
  };

  // Shared field mapping for update / preview saves (status handled by caller).
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
    template_synced_at: data.templateSyncedAt ?? null,
    assessment_mode: data.assessmentMode,
    responder_fields_config: data.responderFieldsConfig,
    max_attempts: data.maxAttempts ?? 1,
    bot_prompt_config: data.botPromptConfig,
    student_instructions: data.studentInstructions,
    show_rubric: data.showRubric ?? true,
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

  // Save-and-preview: update the activity in place, preserving its current status
  // (omit status from the patch). Never navigates.
  const handleSaveForPreview = async (
    data: AssignmentFormSubmitData
  ): Promise<Assignment> => {
    if (!user) {
      throw new Error("You must be logged in to update an assignment");
    }
    if (!assignmentDbId) {
      throw new Error("Assignment not found");
    }
    return updateAssignment(assignmentDbId, buildAssignmentFields(data));
  };

  if (loadingAssignment) {
    return (
      <PageLayout>
        <div />
      </PageLayout>
    );
  }

  if (fetchError && !assignmentDbId) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-destructive">{fetchError}</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-4">
          <BackButton />
        </div>
        <h1 className="text-3xl font-bold mb-8">Edit Assignment</h1>
        <AssignmentForm
          mode="edit"
          classId={classId}
          classDbId={assignmentClassId}
          assignmentId={assignmentId}
          initialTitle={title}
          initialQuestions={questions}
          initialLanguage={preferredLanguage}
          initialLockLanguage={lockLanguage}
          initialIsPublic={isPublic}
          initialActivityType={activityType}
          initialActivityTemplateId={activityTemplateId}
          initialActivityDefinition={activityDefinition}
          initialTemplateSyncedAt={templateSyncedAt}
          initialAssessmentMode={assessmentMode}
          initialResponderFieldsConfig={responderFieldsConfig}
          initialMaxAttempts={maxAttempts}
          initialBotPromptConfig={botPromptConfig}
          initialStudentInstructions={studentInstructions}
          initialShowRubric={showRubric}
          initialShowRubricPoints={showRubricPoints}
          initialUseStarDisplay={useStarDisplay}
          initialStarScale={starScale}
          initialRequireAllAttempts={requireAllAttempts}
          initialSharedContextEnabled={sharedContextEnabled}
          initialSharedContext={sharedContext}
          initialEvaluationPrompt={evaluationPrompt}
          initialFeedbackFocus={feedbackFocus}
          initialExperienceRatingEnabled={experienceRatingEnabled}
          initialExperienceRatingRequired={experienceRatingRequired}
          initialFeedbackRequiresApproval={feedbackRequiresApproval}
          initialBatchGradeRelease={batchGradeRelease}
          initialAllowCopyPaste={allowCopyPaste}
          initialTabSwitchPolicy={tabSwitchPolicy}
          initialTabSwitchMaxLeaves={tabSwitchMaxLeaves}
          initialFileSubmissionConfig={fileSubmissionConfig}
          initialDynamicGenerationPrompt={dynamicGenerationPrompt}
          initialIsDraft={initialIsDraft}
          onSubmit={handleSubmit}
          onSaveForPreview={handleSaveForPreview}
          onCancel={() => router.back()}
        />
      </div>
    </PageLayout>
  );
}
