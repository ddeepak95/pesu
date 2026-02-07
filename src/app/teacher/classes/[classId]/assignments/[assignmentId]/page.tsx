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
  updateAssignment,
  deleteAssignment,
} from "@/lib/queries/assignments";
import { updateContentItemStatusByRef } from "@/lib/queries/contentItems";
import { Assignment } from "@/types/assignment";
import QuestionView from "@/components/Shared/QuestionView";
import { supportedLanguages } from "@/utils/supportedLanguages";
import SubmissionsTab from "@/components/Teacher/Assignments/SubmissionsTab";
import { AssignmentLinkShare } from "@/components/Teacher/Assignments/AssignmentLinkShare";
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
} from "lucide-react";

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
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

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
        responder_fields_config: assignmentData.responder_fields_config ?? undefined,
        max_attempts: assignmentData.max_attempts,
        bot_prompt_config: assignmentData.bot_prompt_config ?? undefined,
        student_instructions: assignmentData.student_instructions ?? undefined,
        show_rubric: assignmentData.show_rubric,
        show_rubric_points: assignmentData.show_rubric_points,
        use_star_display: assignmentData.use_star_display,
        star_scale: assignmentData.star_scale,
        require_all_attempts: assignmentData.require_all_attempts,
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
      alert("Failed to publish assignment. Please try again.");
    }
  };

  const getAssessmentModeInfo = (mode: string | undefined) => {
    switch (mode) {
      case "voice":
        return { label: "Voice Assessment", icon: Mic };
      case "text_chat":
        return { label: "Text Chat Assessment", icon: MessageSquare };
      case "static_text":
        return { label: "Static Text Assessment", icon: FileText };
      default:
        return { label: "Voice Assessment", icon: Mic };
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-muted-foreground">Loading assignment details...</p>
        </div>
      </PageLayout>
    );
  }

  if (error || !assignmentData) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-destructive">{error || "Assignment not found"}</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div>
        <div>
          <div className="mb-4">
            <BackButton href={`/teacher/classes/${classId}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`} />
          </div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold">{assignmentData.title}</h1>
              <div className="flex items-center gap-4 mt-1 text-muted-foreground">
                <p>{assignmentData.total_points} points total</p>
                <span>•</span>
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
            {/* Assessment Type */}
            {(() => {
              const modeInfo = getAssessmentModeInfo(
                assignmentData.assessment_mode
              );
              const ModeIcon = modeInfo.icon;
              return (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-medium">
                  <ModeIcon className="h-4 w-4" />
                  <span>{modeInfo.label}</span>
                </div>
              );
            })()}

            {/* Language */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full text-sm">
              <span>
                {supportedLanguages.find(
                  (lang) => lang.code === assignmentData.preferred_language
                )?.name || assignmentData.preferred_language}
              </span>
              {assignmentData.lock_language && (
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>

            {/* Max Attempts */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full text-sm">
              <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
              <span>
                {assignmentData.max_attempts ?? 1}{" "}
                {(assignmentData.max_attempts ?? 1) === 1
                  ? "attempt"
                  : "attempts"}
              </span>
            </div>

            {/* Public Access */}
            {assignmentData.is_public && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-sm">
                <Globe className="h-3.5 w-3.5" />
                <span>Public</span>
              </div>
            )}
          </div>

          <Tabs defaultValue="questions" className="w-full">
            <TabsList>
              <TabsTrigger value="questions">Questions</TabsTrigger>
              <TabsTrigger value="config">Config</TabsTrigger>
              <TabsTrigger value="submissions">Submissions</TabsTrigger>
            </TabsList>

            <TabsContent value="questions" className="space-y-4 py-6">
              {/* Shared Context */}
              {assignmentData.shared_context && (
                <div className="rounded-md border bg-card text-card-foreground">
                  <div className="flex items-center gap-2 px-4 py-3 text-sm font-medium">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <span>Shared Context</span>
                    {!assignmentData.shared_context_enabled && (
                      <span className="text-xs text-muted-foreground">(disabled)</span>
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
                  <QuestionView key={index} question={question} index={index} />
                ))}
            </TabsContent>

            <TabsContent value="config" className="py-6 space-y-6">
              {/* Display Settings */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Display Settings</h3>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium w-44 shrink-0">Rubric visibility:</span>
                    <span className="text-muted-foreground">
                      {assignmentData.show_rubric ?? true
                        ? assignmentData.show_rubric_points ?? true
                          ? "Shown with points"
                          : "Shown without points"
                        : "Hidden from students"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium w-44 shrink-0">Score display:</span>
                    <span className="text-muted-foreground">
                      {assignmentData.use_star_display
                        ? `Stars (${assignmentData.star_scale ?? 5}-star scale)`
                        : "Points"}
                    </span>
                  </div>
                  {assignmentData.use_star_display && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium w-44 shrink-0">Teacher view:</span>
                      <span className="text-muted-foreground">
                        {assignmentData.teacher_view_stars ? "Stars" : "Points"}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="font-medium w-44 shrink-0">Public access:</span>
                    <span className="text-muted-foreground">
                      {assignmentData.is_public ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium w-44 shrink-0">Require all questions:</span>
                    <span className="text-muted-foreground">
                      {assignmentData.require_all_attempts ? "Yes" : "No"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Student Instructions */}
              {assignmentData.student_instructions && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Instructions for Students</h3>
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
                      <h4 className="font-medium text-sm mb-1">System Prompt</h4>
                      <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded-md p-3 text-muted-foreground">
                        {assignmentData.bot_prompt_config.system_prompt}
                      </pre>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm mb-1">
                        Conversation Start (First Question)
                      </h4>
                      <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded-md p-3 text-muted-foreground">
                        {assignmentData.bot_prompt_config.conversation_start.first_question}
                      </pre>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm mb-1">
                        Conversation Start (Subsequent Questions)
                      </h4>
                      <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded-md p-3 text-muted-foreground">
                        {assignmentData.bot_prompt_config.conversation_start.subsequent_questions}
                      </pre>
                    </div>
                    {assignmentData.bot_prompt_config.question_overrides &&
                      Object.keys(assignmentData.bot_prompt_config.question_overrides).length > 0 && (
                        <div>
                          <h4 className="font-medium text-sm mb-2">
                            Per-Question Overrides
                          </h4>
                          <div className="space-y-3">
                            {Object.entries(assignmentData.bot_prompt_config.question_overrides).map(
                              ([order, override]) => (
                                <div key={order} className="bg-muted/50 rounded-md p-3">
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
                              )
                            )}
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
              <SubmissionsTab
                assignmentId={assignmentData.assignment_id}
                classId={classId}
                isPublic={assignmentData.is_public}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {assignmentData && (
        <AssignmentLinkShare
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          assignmentId={assignmentData.assignment_id}
          classId={classId}
          isPublic={assignmentData.is_public}
        />
      )}
    </PageLayout>
  );
}
