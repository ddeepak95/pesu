"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import PageTitle from "@/components/Shared/PageTitle";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SettingsCard } from "@/components/ui/settings-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  MutedPrimaryTabsList,
  MutedPrimaryTabsTrigger,
} from "@/components/Teacher/Shared/MutedPrimaryTabs";
import { useAuth } from "@/contexts/AuthContext";
import { updateAssignment, deleteAssignment } from "@/lib/queries/assignments";
import { updateContentItemStatusByRef } from "@/lib/queries/contentItems";
import { countContentItemPlacementsByRefTracked } from "@/lib/swr/imperativeReads";
import { resolveTeacherPlacementGroupId } from "@/lib/contentPlacements";
import { removeTeacherMaterialPlacementOrEntity } from "@/lib/teacherMaterialRemove";
import { Assignment } from "@/types/assignment";
import AssignmentForm from "@/components/Teacher/Assignments/AssignmentForm";
import { SubmissionsListSection } from "@/components/Teacher/Assignments/SubmissionsListSection";
import { AssignmentGradeReleaseBanner } from "@/components/Teacher/Assignments/AssignmentGradeReleaseBanner";
import { SubmissionContentPanel } from "@/components/Teacher/Assignments/SubmissionContentPanel";
import { SubmissionGradingPanel } from "@/components/Teacher/Assignments/SubmissionGradingPanel";
import { SubmissionOverlayHeader } from "@/components/Teacher/Assignments/SubmissionOverlayHeader";
import {
  submissionOverlayClasses,
  submissionOverlayGrainStyle,
} from "@/components/Teacher/Assignments/submissionOverlayTheme";
import { AssignmentLinkShare } from "@/components/Teacher/Assignments/AssignmentLinkShare";
import MarkdownContent from "@/components/Shared/MarkdownContent";
import { parseFeedbackFocusAreas } from "@/lib/feedbackFocus";
import { DEFAULT_TAB_SWITCH_POLICY } from "@/lib/integrity/constants";
import { Share2, Award, CircleDot } from "lucide-react";
import { showErrorToast } from "@/lib/toast";
import {
  invalidateSubmissionsCache,
  useMaterialLinkedAcrossGroups,
} from "@/hooks/swr";

/** Maps a saved assignment onto the `initial*` props AssignmentForm needs to render itself read-only. */
function buildAssignmentFormViewProps(assignmentData: Assignment) {
  return {
    initialQuestions: assignmentData.questions,
    initialLanguage: assignmentData.preferred_language,
    initialLockLanguage: assignmentData.lock_language ?? false,
    initialIsPublic: assignmentData.is_public,
    initialActivityType: assignmentData.activity_type ?? "learning",
    initialActivityTemplateId: assignmentData.activity_template_id ?? null,
    initialActivityDefinition:
      assignmentData.activity_definition_snapshot ?? null,
    initialTemplateSyncedAt: assignmentData.template_synced_at ?? null,
    initialAssessmentMode: assignmentData.assessment_mode ?? "voice",
    initialResponderFieldsConfig: assignmentData.responder_fields_config,
    initialMaxAttempts: assignmentData.max_attempts ?? 1,
    initialBotPromptConfig: assignmentData.bot_prompt_config,
    initialShowRubric: assignmentData.show_rubric ?? true,
    initialShowRubricPoints: assignmentData.show_rubric_points ?? true,
    initialUseStarDisplay: assignmentData.use_star_display ?? false,
    initialStarScale: assignmentData.star_scale ?? 5,
    initialRequireAllAttempts: assignmentData.require_all_attempts ?? false,
    initialSharedContextEnabled:
      assignmentData.shared_context_enabled ?? false,
    initialSharedContext: assignmentData.shared_context ?? "",
    initialEvaluationPrompt: assignmentData.evaluation_prompt ?? "",
    initialFeedbackFocus:
      assignmentData.feedback_focus == null
        ? undefined
        : parseFeedbackFocusAreas(assignmentData.feedback_focus),
    initialExperienceRatingEnabled:
      assignmentData.experience_rating_enabled ?? false,
    initialExperienceRatingRequired:
      assignmentData.experience_rating_required ?? false,
    initialFeedbackRequiresApproval:
      assignmentData.feedback_requires_approval ?? false,
    initialBatchGradeRelease: assignmentData.batch_grade_release ?? false,
    initialAllowCopyPaste: assignmentData.allow_copy_paste ?? false,
    initialTabSwitchPolicy:
      assignmentData.tab_switch_policy ?? DEFAULT_TAB_SWITCH_POLICY,
    initialTabSwitchMaxLeaves: assignmentData.tab_switch_max_leaves ?? 3,
    initialFileSubmissionConfig:
      assignmentData.file_submission_config ?? null,
    initialDynamicGenerationPrompt:
      assignmentData.dynamic_generation_prompt ?? "",
    initialIsDraft: assignmentData.status === "draft",
  };
}

interface AssignmentDetailClientProps {
  initialAssignment: Assignment;
  classId: string;
}

export default function AssignmentDetailClient({
  initialAssignment,
  classId,
}: AssignmentDetailClientProps) {
  const router = useTrackedRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const assignmentId = initialAssignment.assignment_id;
  const [assignmentData, setAssignmentData] =
    useState<Assignment>(initialAssignment);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const placementGroupId = useMemo(
    () =>
      resolveTeacherPlacementGroupId(
        searchParams.get("groupId"),
        assignmentData.class_group_id,
      ),
    [searchParams, assignmentData.class_group_id],
  );

  const isLinkedAcrossGroups = useMaterialLinkedAcrossGroups(
    assignmentData.class_id,
    "formative_assignment",
    assignmentData.id,
  );

  const tabParam = searchParams.get("tab");
  const activeTab = useMemo(() => {
    if (
      tabParam === "questions" ||
      tabParam === "config" ||
      tabParam === "submissions"
    ) {
      return tabParam;
    }
    return "questions";
  }, [tabParam]);

  const setTab = (value: string) => {
    const current = new URLSearchParams(searchParams.toString());
    current.set("tab", value);
    current.delete("id");
    router.replace(
      `/teacher/classes/${classId}/assignments/${assignmentId}?${current.toString()}`,
      { scroll: false },
    );
  };

  // Submission detail view state.
  // activeSubmissionId is local state — set immediately on interaction so the overlay
  // appears without waiting for the Next.js router (RSC fetch) to complete.
  const submissionIdFromUrl = searchParams.get("id") ?? null;
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(
    () =>
      searchParams.get("tab") === "submissions" ? searchParams.get("id") : null,
  );
  const [overlayOpen, setOverlayOpen] = useState(
    () => searchParams.get("tab") === "submissions" && !!searchParams.get("id"),
  );

  // Sync from URL changes caused by browser back/forward navigation.
  // Intentionally excludes activeSubmissionId from deps to avoid a feedback loop.
  useEffect(() => {
    if (submissionIdFromUrl !== activeSubmissionId) {
      setActiveSubmissionId(submissionIdFromUrl);
      setOverlayOpen(activeTab === "submissions" && !!submissionIdFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionIdFromUrl]);

  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [selectedAttemptNumber, setSelectedAttemptNumber] = useState<
    number | null
  >(null);

  useEffect(() => {
    setSelectedQuestionIndex(0);
    setSelectedAttemptNumber(null);
  }, [activeSubmissionId]);

  // Opens overlay immediately then updates URL history entry in background.
  const handleViewSubmission = (id: string) => {
    setActiveSubmissionId(id);
    setOverlayOpen(true);
    const q = new URLSearchParams(searchParams.toString());
    q.set("tab", "submissions");
    q.set("id", id);
    router.push(
      `/teacher/classes/${classId}/assignments/${assignmentId}?${q.toString()}`,
    );
  };

  const handleCloseSubmission = () => {
    setActiveSubmissionId(null);
    setOverlayOpen(false);
    const q = new URLSearchParams(searchParams.toString());
    q.set("tab", "submissions");
    q.delete("id");
    window.history.replaceState(
      null,
      "",
      `/teacher/classes/${classId}/assignments/${assignmentId}?${q.toString()}`,
    );
  };

  const isDetailView = overlayOpen && !!activeSubmissionId;

  useEffect(() => {
    if (!isDetailView) return;

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousScrollbarGutter = html.style.scrollbarGutter;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.scrollbarGutter = "auto";

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      html.style.scrollbarGutter = previousScrollbarGutter;
    };
  }, [isDetailView]);

  const handleBackToClass = () => {
    const groupId = searchParams.get("groupId");
    const qs = new URLSearchParams();
    qs.set("tab", "content");
    if (groupId) qs.set("groupId", groupId);
    router.push(`/teacher/classes/${classId}?${qs.toString()}`);
  };

  const handleEdit = () => {
    const qs = searchParams.toString();
    router.push(
      `/teacher/classes/${classId}/assignments/${assignmentId}/edit${
        qs ? `?${qs}` : ""
      }`,
    );
  };

  const handleDelete = async () => {
    if (!user || !assignmentData) return;

    let placementCount = 1;
    try {
      placementCount = await countContentItemPlacementsByRefTracked({
        classId: assignmentData.class_id,
        type: "formative_assignment",
        refId: assignmentData.id,
      });
    } catch (e) {
      console.error(e);
      showErrorToast("Could not verify placements. Please try again.");
      return;
    }

    const confirmed = window.confirm(
      placementCount > 1
        ? "This assignment is linked in more than one group. Remove it only from this group's feed?"
        : "Are you sure you want to delete this assignment? This action cannot be undone.",
    );

    if (!confirmed) return;

    try {
      await removeTeacherMaterialPlacementOrEntity({
        classDbId: assignmentData.class_id,
        type: "formative_assignment",
        refId: assignmentData.id,
        placementGroupId,
        deleteEntitySoft: () =>
          deleteAssignment(assignmentData.id, assignmentData.class_id),
        contentItemsAlreadyHandledWithEntity: true,
      });
      router.push(`/teacher/classes/${classId}`);
    } catch (err) {
      console.error("Error deleting assignment:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to delete assignment. Please try again.";
      showErrorToast(errorMessage);
    }
  };

  const handlePublish = async () => {
    if (!assignmentData) return;

    try {
      const updated = await updateAssignment(assignmentData.id, {
        title: assignmentData.title,
        questions: assignmentData.questions,
        total_points: assignmentData.total_points,
        preferred_language: assignmentData.preferred_language,
        lock_language: assignmentData.lock_language,
        is_public: assignmentData.is_public,
        assessment_mode: assignmentData.assessment_mode,
        status: "active",
        responder_fields_config:
          assignmentData.responder_fields_config ?? undefined,
        max_attempts: assignmentData.max_attempts,
        bot_prompt_config: assignmentData.bot_prompt_config ?? undefined,
        student_instructions: assignmentData.student_instructions ?? undefined,
        show_rubric: assignmentData.show_rubric,
        show_rubric_points: assignmentData.show_rubric_points,
        use_star_display: assignmentData.use_star_display,
        star_scale: assignmentData.star_scale,
        require_all_attempts: assignmentData.require_all_attempts,
        experience_rating_enabled: assignmentData.experience_rating_enabled,
        experience_rating_required: assignmentData.experience_rating_required,
      });

      await updateContentItemStatusByRef({
        class_id: assignmentData.class_id,
        type: "formative_assignment",
        ref_id: assignmentData.id,
        status: updated.status,
      });

      setAssignmentData(updated);
    } catch (err) {
      console.error("Error publishing assignment:", err);
      showErrorToast("Failed to publish assignment. Please try again.");
    }
  };

  return (
    <PageLayout>
      <div>
        <div>
          <div className="mb-4">
            <BackButton label="Back to class" onClick={handleBackToClass} />
          </div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <PageTitle
                title={assignmentData.title}
                isLinked={isLinkedAcrossGroups}
                variant="hero"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Options</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {assignmentData.status === "draft" && (
                  <DropdownMenuItem onClick={handlePublish}>
                    Publish
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setShareDialogOpen(true)}>
                  <Share2 className="h-4 w-4 mr-2" />
                  Share Links
                </DropdownMenuItem>
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

          {/* Assignment Configuration */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-6 text-sm">
            {/* Points */}
            <div className="flex items-center gap-1.5">
              <Award className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Points:</span>
              <span className="font-medium">{assignmentData.total_points}</span>
            </div>

            {/* Status */}
            <div className="flex items-center gap-1.5">
              <CircleDot className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Status:</span>
              <span className="font-medium capitalize">
                {assignmentData.status}
              </span>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setTab} className="w-full">
            <MutedPrimaryTabsList className="mb-4 h-auto w-auto gap-1 rounded-md p-1">
              <MutedPrimaryTabsTrigger
                value="questions"
                className="rounded-sm px-4 py-2"
              >
                Content
              </MutedPrimaryTabsTrigger>
              <MutedPrimaryTabsTrigger
                value="config"
                className="rounded-sm px-4 py-2"
              >
                Config
              </MutedPrimaryTabsTrigger>
              <MutedPrimaryTabsTrigger
                value="submissions"
                className="rounded-sm px-4 py-2"
              >
                Submissions
              </MutedPrimaryTabsTrigger>
            </MutedPrimaryTabsList>

            <TabsContent value="questions" className="space-y-6">
              {/* Instructions for Students */}
              {assignmentData.student_instructions && (
                <SettingsCard className="space-y-2">
                  <Label>Instructions</Label>
                  <MarkdownContent content={assignmentData.student_instructions} />
                </SettingsCard>
              )}
              <AssignmentForm
                mode="view"
                viewSection="content"
                classId={classId}
                classDbId={assignmentData.class_id}
                {...buildAssignmentFormViewProps(assignmentData)}
              />
            </TabsContent>

            <TabsContent value="config" className="space-y-6">
              <AssignmentForm
                mode="view"
                viewSection="settings"
                classId={classId}
                classDbId={assignmentData.class_id}
                {...buildAssignmentFormViewProps(assignmentData)}
              />
            </TabsContent>

            <TabsContent value="submissions">
              {assignmentData.batch_grade_release && (
                <AssignmentGradeReleaseBanner
                  assignmentId={assignmentData.assignment_id}
                  classId={classId}
                  classGroupId={placementGroupId}
                  isPublic={assignmentData.is_public}
                  gradesReleasedAt={assignmentData.grades_released_at ?? null}
                  onChange={(next) =>
                    setAssignmentData((prev) => ({
                      ...prev,
                      grades_released_at: next,
                    }))
                  }
                />
              )}
              <SubmissionsListSection
                assignmentId={assignmentData.assignment_id}
                classId={classId}
                isPublic={assignmentData.is_public}
                classGroupId={placementGroupId}
                onViewSubmission={handleViewSubmission}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <AssignmentLinkShare
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        assignmentId={assignmentData.assignment_id}
        classId={classId}
        isPublic={assignmentData.is_public}
      />

      {/* Submission detail overlay — keeps SubmissionsListSection mounted underneath */}
      {isDetailView && activeSubmissionId && (
        <div className={submissionOverlayClasses.shell}>
          <div
            aria-hidden="true"
            className={submissionOverlayClasses.grain}
            style={submissionOverlayGrainStyle}
          />
          <SubmissionOverlayHeader
            submissionId={activeSubmissionId}
            assignmentId={assignmentId}
            classId={classId}
            onNavigate={handleViewSubmission}
            onClose={handleCloseSubmission}
          />
          <div className={submissionOverlayClasses.contentRow}>
            <div className={submissionOverlayClasses.contentPane}>
              <SubmissionContentPanel
                submissionId={activeSubmissionId}
                assignmentId={assignmentId}
                selectedQuestionIndex={selectedQuestionIndex}
                selectedAttemptNumber={selectedAttemptNumber}
                onIntegrityRestored={async () => {
                  await invalidateSubmissionsCache();
                }}
              />
            </div>
            <div className={submissionOverlayClasses.gradingPane}>
              <SubmissionGradingPanel
                submissionId={activeSubmissionId}
                assignmentId={assignmentId}
                selectedQuestionIndex={selectedQuestionIndex}
                onQuestionChange={setSelectedQuestionIndex}
                selectedAttemptNumber={selectedAttemptNumber}
                onAttemptChange={setSelectedAttemptNumber}
              />
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
