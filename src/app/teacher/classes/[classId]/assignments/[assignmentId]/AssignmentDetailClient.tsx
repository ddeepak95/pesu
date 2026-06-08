"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import PageTitle from "@/components/Shared/PageTitle";
import { Button } from "@/components/ui/button";
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
import {
  updateAssignment,
  deleteAssignment,
} from "@/lib/queries/assignments";
import { updateContentItemStatusByRef } from "@/lib/queries/contentItems";
import { countContentItemPlacementsByRefTracked } from "@/lib/swr/imperativeReads";
import { resolveTeacherPlacementGroupId } from "@/lib/contentPlacements";
import { removeTeacherMaterialPlacementOrEntity } from "@/lib/teacherMaterialRemove";
import { Assignment } from "@/types/assignment";
import QuestionView from "@/components/Shared/QuestionView";
import { supportedLanguages } from "@/utils/supportedLanguages";
import { SubmissionsListSection } from "@/components/Teacher/Assignments/SubmissionsListSection";
import { SubmissionContentPanel } from "@/components/Teacher/Assignments/SubmissionContentPanel";
import { SubmissionGradingPanel } from "@/components/Teacher/Assignments/SubmissionGradingPanel";
import { AssignmentLinkShare } from "@/components/Teacher/Assignments/AssignmentLinkShare";
import { Pill } from "@/components/ui/pill";
import MarkdownContent from "@/components/Shared/MarkdownContent";
import {
  Share2,
  Mic,
  MessageSquare,
  FileText,
  Lock,
  Globe,
  RotateCcw,
  BookOpen,
  Bot,
  ClipboardCheck,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { showErrorToast } from "@/lib/toast";
import { invalidateSubmissionsCache, useMaterialLinkedAcrossGroups } from "@/hooks/swr";

function CollapsibleSection({
  icon: Icon,
  title,
  children,
  defaultOpen = false,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={`rounded-md border bg-card text-card-foreground ${className ?? ""}`}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-muted/50 transition-colors rounded-md"
      >
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1">{title}</span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
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
        assignmentData.class_group_id
      ),
    [searchParams, assignmentData.class_group_id]
  );

  const isLinkedAcrossGroups = useMaterialLinkedAcrossGroups(
    assignmentData.class_id,
    "formative_assignment",
    assignmentData.id
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
      { scroll: false }
    );
  };

  // Submission detail view state.
  // activeSubmissionId is local state — set immediately on interaction so the overlay
  // appears without waiting for the Next.js router (RSC fetch) to complete.
  const submissionIdFromUrl = searchParams.get("id") ?? null;
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(
    () => searchParams.get("tab") === "submissions" ? searchParams.get("id") : null
  );
  const [overlayOpen, setOverlayOpen] = useState(
    () => searchParams.get("tab") === "submissions" && !!searchParams.get("id")
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
  const [selectedAttemptNumber, setSelectedAttemptNumber] = useState<number | null>(null);

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
      `/teacher/classes/${classId}/assignments/${assignmentId}?${q.toString()}`
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
      `/teacher/classes/${classId}/assignments/${assignmentId}?${q.toString()}`
    );
  };

  const isDetailView = overlayOpen && !!activeSubmissionId;

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
        : "Are you sure you want to delete this assignment? This action cannot be undone."
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
        student_instructions:
          assignmentData.student_instructions ?? undefined,
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

  const getAssessmentModeInfo = (mode: string | undefined) => {
    switch (mode) {
      case "voice":
        return { label: "Voice", icon: Mic };
      case "text_chat":
        return { label: "Text Chat", icon: MessageSquare };
      case "static_text":
        return { label: "Static Text", icon: FileText };
      case "multimodal":
        return { label: "Multimodal", icon: Sparkles };
      default:
        return { label: "Voice", icon: Mic };
    }
  };

  return (
    <PageLayout>
      <div>
        <div>
          <div className="mb-4">
            <BackButton />
          </div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <PageTitle
                title={assignmentData.title}
                isLinked={isLinkedAcrossGroups}
                variant="hero"
              />
              <div className="flex items-center gap-4 mt-1 text-muted-foreground">
                <p>{assignmentData.total_points} points total</p>
                <span>&bull;</span>
                <p className="capitalize">Status: {assignmentData.status}</p>
              </div>
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
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {/* Activity Type */}
            <Pill purpose="assignmentActivityType" size="lg">
              <BookOpen className="h-4 w-4" />
              <span>
                {assignmentData.activity_type === "assessment" ? "Assessment" : assignmentData.activity_type === "speaking_practice" ? "Speaking Practice" : "Learning"}
              </span>
            </Pill>

            {/* Interaction Type */}
            {(() => {
              const modeInfo = getAssessmentModeInfo(
                assignmentData.assessment_mode
              );
              const ModeIcon = modeInfo.icon;
              return (
                <Pill purpose="assessmentMode" size="lg">
                  <ModeIcon className="h-4 w-4" />
                  <span>{modeInfo.label}</span>
                </Pill>
              );
            })()}

            {/* Language */}
            <Pill purpose="assignmentMeta" size="lg">
              <span>
                {supportedLanguages.find(
                  (lang) => lang.code === assignmentData.preferred_language
                )?.name || assignmentData.preferred_language}
              </span>
              {assignmentData.lock_language && (
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Pill>

            {/* Max Attempts */}
            <Pill purpose="assignmentMeta" size="lg">
              <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
              <span>
                {assignmentData.max_attempts ?? 1}{" "}
                {(assignmentData.max_attempts ?? 1) === 1
                  ? "attempt"
                  : "attempts"}
              </span>
            </Pill>

            {/* Public Access */}
            {assignmentData.is_public && (
              <Pill purpose="assignmentPublicAccess" size="lg">
                <Globe className="h-3.5 w-3.5" />
                <span>Public</span>
              </Pill>
            )}
          </div>

          <Tabs
            value={activeTab}
            onValueChange={setTab}
            className="w-full"
          >
            <MutedPrimaryTabsList className="mb-4 h-auto w-auto gap-1 rounded-md p-1">
              <MutedPrimaryTabsTrigger
                value="questions"
                className="rounded-sm px-4 py-2"
              >
                Questions
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

            <TabsContent value="questions" className="space-y-4 py-6">
              {assignmentData.shared_context && (
                <div className="rounded-md border bg-card text-card-foreground">
                  <div className="flex items-center gap-2 px-4 py-3 text-sm font-medium">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <span>Additional context</span>
                    {!assignmentData.shared_context_enabled && (
                      <span className="text-xs text-muted-foreground">
                        (disabled)
                      </span>
                    )}
                  </div>
                  <div className="px-4 pb-4">
                    <MarkdownContent content={assignmentData.shared_context} />
                  </div>
                </div>
              )}

              {assignmentData.questions
                .sort((a, b) => a.order - b.order)
                .map((question, index) => (
                  <QuestionView
                    key={index}
                    question={question}
                    index={index}
                    showDynamicBadges
                    showRubric
                    activityType={assignmentData.activity_type}
                  />
                ))}
            </TabsContent>

            <TabsContent value="config" className="py-6 space-y-6">
              {/* Display Settings */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Display Settings</h3>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium w-44 shrink-0">
                      Rubric visibility:
                    </span>
                    <span className="text-muted-foreground">
                      {assignmentData.show_rubric ?? true
                        ? assignmentData.show_rubric_points ?? true
                          ? "Shown with points"
                          : "Shown without points"
                        : "Hidden from students"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium w-44 shrink-0">
                      Score display:
                    </span>
                    <span className="text-muted-foreground">
                      {assignmentData.use_star_display
                        ? `Stars (${assignmentData.star_scale ?? 5}-star scale)`
                        : "Points"}
                    </span>
                  </div>
                  {assignmentData.use_star_display && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium w-44 shrink-0">
                        Teacher view:
                      </span>
                      <span className="text-muted-foreground">
                        {assignmentData.teacher_view_stars ? "Stars" : "Points"}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="font-medium w-44 shrink-0">
                      Public access:
                    </span>
                    <span className="text-muted-foreground">
                      {assignmentData.is_public ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium w-44 shrink-0">
                      Require all questions:
                    </span>
                    <span className="text-muted-foreground">
                      {assignmentData.require_all_attempts ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium w-44 shrink-0">
                      Experience rating:
                    </span>
                    <span className="text-muted-foreground">
                      {assignmentData.experience_rating_enabled
                        ? assignmentData.experience_rating_required
                          ? "Enabled (required)"
                          : "Enabled (optional)"
                        : "Disabled"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Student Instructions */}
              {assignmentData.student_instructions && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">
                    Instructions for Students
                  </h3>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {assignmentData.student_instructions}
                  </p>
                </div>
              )}

              {/* AI Prompt Configuration */}
              {assignmentData.bot_prompt_config && (
                <CollapsibleSection
                  icon={Bot}
                  title="AI Prompt Configuration"
                  defaultOpen={false}
                >
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-sm mb-1">
                        System Prompt
                      </h4>
                      <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded-md p-3 text-muted-foreground">
                        {assignmentData.bot_prompt_config.system_prompt}
                      </pre>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm mb-1">
                        Conversation Start (First Question)
                      </h4>
                      <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded-md p-3 text-muted-foreground">
                        {
                          assignmentData.bot_prompt_config.conversation_start
                            .first_question
                        }
                      </pre>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm mb-1">
                        Conversation Start (Subsequent Questions)
                      </h4>
                      <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded-md p-3 text-muted-foreground">
                        {
                          assignmentData.bot_prompt_config.conversation_start
                            .subsequent_questions
                        }
                      </pre>
                    </div>
                    {assignmentData.bot_prompt_config.question_overrides &&
                      Object.keys(
                        assignmentData.bot_prompt_config.question_overrides
                      ).length > 0 && (
                        <div>
                          <h4 className="font-medium text-sm mb-2">
                            Per-Question Overrides
                          </h4>
                          <div className="space-y-3">
                            {Object.entries(
                              assignmentData.bot_prompt_config
                                .question_overrides
                            ).map(([order, override]) => (
                              <div
                                key={order}
                                className="bg-muted/50 rounded-md p-3"
                              >
                                <p className="text-sm font-medium mb-1">
                                  Question {Number(order) + 1}
                                </p>
                                {override.system_prompt && (
                                  <div className="mb-2">
                                    <p className="text-xs text-muted-foreground mb-0.5">
                                      System Prompt Override
                                    </p>
                                    <pre className="whitespace-pre-wrap text-sm text-muted-foreground">
                                      {override.system_prompt}
                                    </pre>
                                  </div>
                                )}
                                {override.conversation_start && (
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-0.5">
                                      Conversation Start Override
                                    </p>
                                    <pre className="whitespace-pre-wrap text-sm text-muted-foreground">
                                      {override.conversation_start}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                </CollapsibleSection>
              )}

              {/* Custom Evaluation Prompt */}
              {assignmentData.evaluation_prompt && (
                <CollapsibleSection
                  icon={ClipboardCheck}
                  title="Custom Evaluation Prompt"
                  defaultOpen={false}
                >
                  <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded-md p-3 text-muted-foreground">
                    {assignmentData.evaluation_prompt}
                  </pre>
                </CollapsibleSection>
              )}
            </TabsContent>

            <TabsContent value="submissions" className="py-6">
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
        <div className="fixed inset-0 z-50 flex overflow-hidden bg-background">
          <div className="flex-[3] overflow-y-auto border-r p-6">
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
          <div className="flex-[2] overflow-y-auto p-6">
            <SubmissionGradingPanel
              submissionId={activeSubmissionId}
              assignmentId={assignmentId}
              classId={classId}
              selectedQuestionIndex={selectedQuestionIndex}
              onQuestionChange={setSelectedQuestionIndex}
              selectedAttemptNumber={selectedAttemptNumber}
              onAttemptChange={setSelectedAttemptNumber}
              onNavigate={handleViewSubmission}
              onClose={handleCloseSubmission}
            />
          </div>
        </div>
      )}
    </PageLayout>
  );
}
