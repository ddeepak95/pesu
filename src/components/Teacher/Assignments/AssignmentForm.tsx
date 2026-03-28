"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MarkdownEditor from "@/components/Shared/MarkdownEditor";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import QuestionCard from "@/components/Teacher/Assignments/QuestionCard";
import { SharedContextSection } from "@/components/Teacher/Assignments/SharedContextSection";
import { FileSubmissionSection } from "@/components/Teacher/Assignments/FileSubmissionSection";
import { MoreOptionsGeneral } from "@/components/Teacher/Assignments/MoreOptionsGeneral";
import { MoreOptionsAIBot } from "@/components/Teacher/Assignments/MoreOptionsAIBot";
import {
  Question,
  RubricItem,
  ResponderFieldConfig,
  BotPromptConfig,
  FileSubmissionConfig,
} from "@/types/assignment";
import type { TabSwitchPolicy } from "@/lib/integrity/constants";
import { DEFAULT_TAB_SWITCH_POLICY } from "@/lib/integrity/constants";
import { type AssignmentIntegritySettingsValues } from "@/components/Shared/Integrity/AssignmentIntegritySettings";
import {
  getDefaultBotPromptConfig,
  getDefaultEvaluationPrompt,
  buildDefaultBotPromptConfig,
  buildDefaultEvaluationPrompt,
  type ActivityType,
} from "@/lib/promptTemplates";
import { ChevronDown } from "lucide-react";
import { showSuccessToast } from "@/lib/toast";

interface AssignmentFormProps {
  mode: "create" | "edit";
  classId: string;
  assignmentId?: string;
  initialTitle?: string;
  initialQuestions?: Question[];
  initialLanguage?: string;
  initialLockLanguage?: boolean;
  initialIsPublic?: boolean;
  initialActivityType?: ActivityType;
  initialAssessmentMode?: "voice" | "text_chat" | "static_text";
  initialResponderFieldsConfig?: ResponderFieldConfig[];
  initialMaxAttempts?: number;
  initialBotPromptConfig?: BotPromptConfig;
  initialStudentInstructions?: string;
  initialShowRubric?: boolean;
  initialShowRubricPoints?: boolean;
  initialUseStarDisplay?: boolean;
  initialStarScale?: number;
  initialRequireAllAttempts?: boolean;
  initialSharedContextEnabled?: boolean;
  initialSharedContext?: string;
  initialEvaluationPrompt?: string;
  initialExperienceRatingEnabled?: boolean;
  initialExperienceRatingRequired?: boolean;
  initialFeedbackRequiresApproval?: boolean;
  initialAllowCopyPaste?: boolean;
  initialTabSwitchPolicy?: TabSwitchPolicy;
  initialTabSwitchMaxLeaves?: number;
  initialFileSubmissionConfig?: FileSubmissionConfig | null;
  initialIsDraft?: boolean;
  onSubmit: (data: {
    title: string;
    questions: Question[];
    totalPoints: number;
    preferredLanguage: string;
    lockLanguage: boolean;
    isPublic: boolean;
    activityType: ActivityType;
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
    sharedContextEnabled?: boolean;
    sharedContext?: string;
    evaluationPrompt?: string;
    experienceRatingEnabled?: boolean;
    experienceRatingRequired?: boolean;
    feedbackRequiresApproval?: boolean;
    allowCopyPaste?: boolean;
    tabSwitchPolicy?: TabSwitchPolicy;
    tabSwitchMaxLeaves?: number;
    fileSubmissionConfig?: FileSubmissionConfig | null;
  }) => Promise<void>;
}

export default function AssignmentForm({
  mode,
  classId,
  assignmentId: _assignmentId,
  initialTitle = "",
  initialQuestions = [
    {
      order: 0,
      prompt: "",
      total_points: 0,
      rubric: [
        { item: "", points: 0 },
        { item: "", points: 0 },
      ],
      supporting_content: "",
      expected_answer: "",
    },
  ],
  initialLanguage = "en",
  initialLockLanguage = false,
  initialIsPublic = false,
  initialActivityType = "learning",
  initialAssessmentMode = "voice",
  initialResponderFieldsConfig,
  initialMaxAttempts = 3,
  initialBotPromptConfig,
  initialStudentInstructions = "",
  initialShowRubric = false,
  initialShowRubricPoints = true,
  initialUseStarDisplay = false,
  initialStarScale = 5,
  initialRequireAllAttempts = false,
  initialSharedContextEnabled = false,
  initialSharedContext = "",
  initialEvaluationPrompt = "",
  initialExperienceRatingEnabled = false,
  initialExperienceRatingRequired = false,
  initialFeedbackRequiresApproval = false,
  initialAllowCopyPaste = false,
  initialTabSwitchPolicy = DEFAULT_TAB_SWITCH_POLICY,
  initialTabSwitchMaxLeaves = 3,
  initialFileSubmissionConfig = null,
  initialIsDraft = false,
  onSubmit,
}: AssignmentFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [preferredLanguage, setPreferredLanguage] = useState(initialLanguage);
  const [lockLanguage, setLockLanguage] = useState(initialLockLanguage);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [activityType, setActivityType] =
    useState<ActivityType>(initialActivityType);
  const [assessmentMode, setAssessmentMode] = useState<
    "voice" | "text_chat" | "static_text"
  >(initialAssessmentMode);
  const [maxAttempts, setMaxAttempts] = useState(initialMaxAttempts);
  const [responderFieldsConfig, setResponderFieldsConfig] = useState<
    ResponderFieldConfig[]
  >(
    initialResponderFieldsConfig || [
      {
        field: "name",
        type: "text",
        label: "Your Name",
        required: true,
        placeholder: "Enter your name",
      },
    ],
  );
  const [botPromptConfig, setBotPromptConfig] = useState<BotPromptConfig>(
    initialBotPromptConfig || getDefaultBotPromptConfig(),
  );
  const [studentInstructions, setStudentInstructions] = useState(
    initialStudentInstructions,
  );
  const [showRubric, setShowRubric] = useState(initialShowRubric);
  const [showRubricPoints, setShowRubricPoints] = useState(
    initialShowRubricPoints,
  );
  const [useStarDisplay, setUseStarDisplay] = useState(initialUseStarDisplay);
  const [starScale, setStarScale] = useState(initialStarScale);
  const [requireAllAttempts, setRequireAllAttempts] = useState(
    initialRequireAllAttempts,
  );
  const [sharedContextEnabled, setSharedContextEnabled] = useState(
    initialSharedContextEnabled,
  );
  const [sharedContext, setSharedContext] = useState(initialSharedContext);
  const [evaluationPrompt, setEvaluationPrompt] = useState(
    initialEvaluationPrompt || getDefaultEvaluationPrompt(),
  );
  const [experienceRatingEnabled, setExperienceRatingEnabled] = useState(
    initialExperienceRatingEnabled,
  );
  const [experienceRatingRequired, setExperienceRatingRequired] = useState(
    initialExperienceRatingRequired,
  );
  const [feedbackRequiresApproval, setFeedbackRequiresApproval] = useState(
    initialFeedbackRequiresApproval,
  );
  const [integritySettings, setIntegritySettings] =
    useState<AssignmentIntegritySettingsValues>({
      allowCopyPaste: initialAllowCopyPaste,
      tabSwitchPolicy: initialTabSwitchPolicy,
      tabSwitchMaxLeaves: initialTabSwitchMaxLeaves,
    });
  const [fileSubmissionEnabled, setFileSubmissionEnabled] = useState(
    !!initialFileSubmissionConfig?.required,
  );
  const [fileAllowMultiple, setFileAllowMultiple] = useState(
    initialFileSubmissionConfig?.allow_multiple ?? false,
  );
  const [fileInstructions, setFileInstructions] = useState(
    initialFileSubmissionConfig?.instructions ?? "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false);
  const [showBotPreview, setShowBotPreview] = useState(false);
  const [previewQuestionOrder, setPreviewQuestionOrder] = useState<0 | 1>(0);

  const handleQuestionChange = (
    questionIndex: number,
    field: keyof Question,
    value: Question[keyof Question],
  ) => {
    setQuestions((prevQuestions) => {
      const newQuestions = [...prevQuestions];
      // For array fields like rubric, ensure we create a new array reference with new objects
      if (field === "rubric" && Array.isArray(value)) {
        newQuestions[questionIndex] = {
          ...newQuestions[questionIndex],
          [field]: value.map((item: RubricItem) => ({ ...item })), // Deep copy array items
        };
      } else {
        newQuestions[questionIndex] = {
          ...newQuestions[questionIndex],
          [field]: value,
        };
      }
      return newQuestions;
    });
  };

  const handleRubricChange = (
    questionIndex: number,
    rubricIndex: number,
    field: keyof RubricItem,
    value: string | number,
  ) => {
    const newQuestions = [...questions];
    const newRubric = [...newQuestions[questionIndex].rubric];
    newRubric[rubricIndex] = {
      ...newRubric[rubricIndex],
      [field]: value,
    };
    newQuestions[questionIndex].rubric = newRubric;

    // Don't auto-calculate total points - user enters it manually
    // Validation will check if rubric sum matches total points

    setQuestions(newQuestions);
  };

  const handleAddRubricItem = (questionIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[questionIndex].rubric.push({ item: "", points: 0 });
    setQuestions(newQuestions);
  };

  const handleRemoveRubricItem = (
    questionIndex: number,
    rubricIndex: number,
  ) => {
    const newQuestions = [...questions];
    if (newQuestions[questionIndex].rubric.length > 1) {
      newQuestions[questionIndex].rubric = newQuestions[
        questionIndex
      ].rubric.filter((_, i) => i !== rubricIndex);

      // Don't auto-calculate total points - user enters it manually

      setQuestions(newQuestions);
    }
  };

  const handleAddQuestion = () => {
    const newQuestion: Question = {
      order: questions.length,
      prompt: "",
      total_points: 0,
      rubric: [
        { item: "", points: 0 },
        { item: "", points: 0 },
      ],
      supporting_content: "",
      expected_answer: "",
    };
    setQuestions([...questions, newQuestion]);
  };

  const handleMoveQuestionUp = (index: number) => {
    if (index > 0) {
      const newQuestions = [...questions];
      [newQuestions[index - 1], newQuestions[index]] = [
        newQuestions[index],
        newQuestions[index - 1],
      ];
      // Update order
      newQuestions.forEach((q, i) => (q.order = i));
      setQuestions(newQuestions);
    }
  };

  const handleMoveQuestionDown = (index: number) => {
    if (index < questions.length - 1) {
      const newQuestions = [...questions];
      [newQuestions[index], newQuestions[index + 1]] = [
        newQuestions[index + 1],
        newQuestions[index],
      ];
      // Update order
      newQuestions.forEach((q, i) => (q.order = i));
      setQuestions(newQuestions);
    }
  };

  const handleDeleteQuestion = (index: number) => {
    if (questions.length > 1) {
      const newQuestions = questions.filter((_, i) => i !== index);
      // Update order
      newQuestions.forEach((q, i) => (q.order = i));
      setQuestions(newQuestions);

      // Also remove any question override for the deleted question
      if (botPromptConfig.question_overrides?.[index] !== undefined) {
        const newOverrides = { ...botPromptConfig.question_overrides };
        // Remove the deleted question's override and re-index higher ones
        const updatedOverrides: Record<number, (typeof newOverrides)[number]> =
          {};
        for (const [key, value] of Object.entries(newOverrides)) {
          const order = parseInt(key, 10);
          if (order < index) {
            updatedOverrides[order] = value;
          } else if (order > index) {
            updatedOverrides[order - 1] = value;
          }
          // order === index is skipped (deleted)
        }
        setBotPromptConfig({
          ...botPromptConfig,
          question_overrides:
            Object.keys(updatedOverrides).length > 0
              ? updatedOverrides
              : undefined,
        });
      }
    }
  };

  // Handle question prompt override changes
  const handleQuestionOverrideChange = (
    questionOrder: number,
    override: import("@/types/assignment").QuestionPromptOverride | undefined,
  ) => {
    const currentOverrides = botPromptConfig.question_overrides || {};

    if (override === undefined) {
      // Remove the override for this question
      const { [questionOrder]: _, ...rest } = currentOverrides;
      setBotPromptConfig({
        ...botPromptConfig,
        question_overrides: Object.keys(rest).length > 0 ? rest : undefined,
      });
    } else {
      // Set or update the override for this question
      setBotPromptConfig({
        ...botPromptConfig,
        question_overrides: {
          ...currentOverrides,
          [questionOrder]: override,
        },
      });
    }
  };

  // Get the default conversation start based on question order
  const getDefaultConversationStart = (questionOrder: number) => {
    return questionOrder === 0
      ? botPromptConfig.conversation_start.first_question
      : botPromptConfig.conversation_start.subsequent_questions;
  };

  const handleSubmit = async (e: React.FormEvent, draft: boolean = false) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!title.trim()) {
      setError("Assignment title is required");
      return;
    }

    if (sharedContextEnabled && !sharedContext.trim()) {
      setError(
        "Additional context text is required when additional context is enabled",
      );
      return;
    }

    // Validate each question
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];

      if (!question.prompt.trim()) {
        setError(`Question ${i + 1}: Prompt is required`);
        return;
      }

      if (question.total_points <= 0) {
        setError(`Question ${i + 1}: Total points must be greater than 0`);
        return;
      }

      const validRubricItems = question.rubric.filter(
        (item) => item.item.trim() && item.points > 0,
      );

      if (validRubricItems.length === 0) {
        setError(
          `Question ${i + 1}: At least one valid rubric item is required`,
        );
        return;
      }

      // Validate that rubric points sum equals total points
      const rubricSum = validRubricItems.reduce(
        (sum, item) => sum + (item.points || 0),
        0,
      );
      if (rubricSum !== question.total_points) {
        setError(
          `Question ${
            i + 1
          }: Rubric points (${rubricSum}) must equal total points (${
            question.total_points
          })`,
        );
        return;
      }
    }

    setLoading(true);

    try {
      // Clean up questions (remove empty rubric items)
      const cleanedQuestions = questions.map((q) => ({
        ...q,
        rubric: q.rubric.filter((item) => item.item.trim() && item.points > 0),
      }));

      // Calculate total points for assignment
      const totalPoints = cleanedQuestions.reduce(
        (sum, q) => sum + q.total_points,
        0,
      );

      await onSubmit({
        title: title.trim(),
        questions: cleanedQuestions,
        totalPoints,
        preferredLanguage,
        lockLanguage,
        isPublic,
        activityType,
        assessmentMode,
        isDraft: draft,
        responderFieldsConfig: isPublic ? responderFieldsConfig : undefined,
        maxAttempts,
        // Always retain botPromptConfig so switching modes doesn't lose it
        botPromptConfig,
        studentInstructions: studentInstructions.trim() || undefined,
        showRubric,
        showRubricPoints,
        useStarDisplay,
        starScale,
        requireAllAttempts,
        sharedContextEnabled,
        sharedContext: sharedContextEnabled ? sharedContext.trim() : undefined,
        evaluationPrompt: evaluationPrompt.trim() || undefined,
        experienceRatingEnabled,
        experienceRatingRequired: experienceRatingEnabled
          ? experienceRatingRequired
          : false,
        feedbackRequiresApproval,
        allowCopyPaste: integritySettings.allowCopyPaste,
        tabSwitchPolicy: integritySettings.tabSwitchPolicy,
        tabSwitchMaxLeaves: integritySettings.tabSwitchMaxLeaves,
        fileSubmissionConfig: fileSubmissionEnabled
          ? {
              required: true,
              allow_multiple: fileAllowMultiple,
              instructions: fileInstructions.trim() || undefined,
              allowed_file_types: [".pdf"],
            }
          : null,
      });

      // Navigate based on mode
      if (mode === "edit") {
        showSuccessToast("Assignment updated successfully");
      } else {
        router.push(`/teacher/classes/${classId}`);
      }
    } catch (err) {
      console.error(
        `Error ${mode === "edit" ? "updating" : "creating"} assignment:`,
        err,
      );
      setError(
        `Failed to ${
          mode === "edit" ? "update" : "create"
        } assignment. Please try again.`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Assignment Title */}
      <div className="space-y-2">
        <Label htmlFor="title">
          Title <span className="text-destructive">*</span>
        </Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={loading}
          placeholder="Enter title"
        />
      </div>

      {/* Instructions (markdown) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="studentInstructions">Instructions</Label>
            <InfoTooltip text="Enter the instructions for the activity." />
          </div>
          <span className="text-xs text-muted-foreground">
            Markdown supported
          </span>
        </div>
        <MarkdownEditor
          id="studentInstructions"
          value={studentInstructions}
          onChange={setStudentInstructions}
          disabled={loading}
          placeholder="Enter instructions for the activity..."
          rows={4}
        />
      </div>

      {/* Activity Type & Interaction Type (side by side) */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="activityType">
            Activity Type <span className="text-destructive">*</span>
          </Label>
          <Select
            value={activityType}
            onValueChange={(value) => {
              const newType = value as ActivityType;
              setActivityType(newType);
              setBotPromptConfig(
                buildDefaultBotPromptConfig(newType, assessmentMode),
              );
              setEvaluationPrompt(buildDefaultEvaluationPrompt(newType));
            }}
            disabled={loading}
          >
            <SelectTrigger id="activityType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="learning">Learning</SelectItem>
              <SelectItem value="assessment">Assessment</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="assessmentMode">
            Interaction Type <span className="text-destructive">*</span>
          </Label>
          <Select
            value={assessmentMode}
            onValueChange={(value) => {
              const newMode = value as "voice" | "text_chat" | "static_text";
              setAssessmentMode(newMode);
              setBotPromptConfig(
                buildDefaultBotPromptConfig(activityType, newMode),
              );
            }}
            disabled={loading}
          >
            <SelectTrigger id="assessmentMode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="voice">Voice</SelectItem>
              <SelectItem value="text_chat">Text Chat</SelectItem>
              <SelectItem value="static_text">Static Text</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Contextual Information for AI (moved above More Options) */}
      <SharedContextSection
        sharedContextEnabled={sharedContextEnabled}
        setSharedContextEnabled={setSharedContextEnabled}
        sharedContext={sharedContext}
        setSharedContext={setSharedContext}
        loading={loading}
      />

      {/* Require File Upload (moved outside More Options) */}
      <FileSubmissionSection
        fileSubmissionEnabled={fileSubmissionEnabled}
        setFileSubmissionEnabled={setFileSubmissionEnabled}
        fileAllowMultiple={fileAllowMultiple}
        setFileAllowMultiple={setFileAllowMultiple}
        fileInstructions={fileInstructions}
        setFileInstructions={setFileInstructions}
        loading={loading}
      />

      {/* More Options (with General & AI Bot subtabs) */}
      <div className="border rounded-md">
        <button
          type="button"
          onClick={() => setIsMoreOptionsOpen(!isMoreOptionsOpen)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
          disabled={loading}
        >
          <h3 className="text-sm font-semibold">More Options</h3>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${
              isMoreOptionsOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {isMoreOptionsOpen && (
          <div className="p-4 pt-0 border-t">
            <Tabs defaultValue="general">
              <TabsList className="grid w-full grid-cols-2 mt-4">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="aibot">AI Bot</TabsTrigger>
              </TabsList>

              <TabsContent value="general">
                <MoreOptionsGeneral
                  preferredLanguage={preferredLanguage}
                  setPreferredLanguage={setPreferredLanguage}
                  lockLanguage={lockLanguage}
                  setLockLanguage={setLockLanguage}
                  maxAttempts={maxAttempts}
                  setMaxAttempts={setMaxAttempts}
                  requireAllAttempts={requireAllAttempts}
                  setRequireAllAttempts={setRequireAllAttempts}
                  showRubric={showRubric}
                  setShowRubric={setShowRubric}
                  showRubricPoints={showRubricPoints}
                  setShowRubricPoints={setShowRubricPoints}
                  useStarDisplay={useStarDisplay}
                  setUseStarDisplay={setUseStarDisplay}
                  starScale={starScale}
                  setStarScale={setStarScale}
                  experienceRatingEnabled={experienceRatingEnabled}
                  setExperienceRatingEnabled={setExperienceRatingEnabled}
                  experienceRatingRequired={experienceRatingRequired}
                  setExperienceRatingRequired={setExperienceRatingRequired}
                  feedbackRequiresApproval={feedbackRequiresApproval}
                  setFeedbackRequiresApproval={setFeedbackRequiresApproval}
                  integritySettings={integritySettings}
                  setIntegritySettings={setIntegritySettings}
                  isPublic={isPublic}
                  setIsPublic={setIsPublic}
                  responderFieldsConfig={responderFieldsConfig}
                  setResponderFieldsConfig={setResponderFieldsConfig}
                  loading={loading}
                />
              </TabsContent>

              <TabsContent value="aibot">
                <MoreOptionsAIBot
                  assessmentMode={assessmentMode}
                  showBotPreview={showBotPreview}
                  setShowBotPreview={setShowBotPreview}
                  previewQuestionOrder={previewQuestionOrder}
                  setPreviewQuestionOrder={setPreviewQuestionOrder}
                  botPromptConfig={botPromptConfig}
                  setBotPromptConfig={setBotPromptConfig}
                  evaluationPrompt={evaluationPrompt}
                  setEvaluationPrompt={setEvaluationPrompt}
                  activityType={activityType}
                  questions={questions}
                  title={title}
                  studentInstructions={studentInstructions}
                  preferredLanguage={preferredLanguage}
                  maxAttempts={maxAttempts}
                  sharedContextEnabled={sharedContextEnabled}
                  sharedContext={sharedContext}
                  loading={loading}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((question, index) => (
          <QuestionCard
            key={index}
            question={question}
            index={index}
            totalQuestions={questions.length}
            onChange={handleQuestionChange}
            onRubricChange={handleRubricChange}
            onAddRubricItem={handleAddRubricItem}
            onRemoveRubricItem={handleRemoveRubricItem}
            onMoveUp={handleMoveQuestionUp}
            onMoveDown={handleMoveQuestionDown}
            onDelete={handleDeleteQuestion}
            disabled={loading}
            title={title}
            studentInstructions={studentInstructions}
            contextForAI={sharedContext}
            showBotOverride={
              assessmentMode === "voice" || assessmentMode === "text_chat"
            }
            questionOverride={
              botPromptConfig.question_overrides?.[question.order]
            }
            onQuestionOverrideChange={handleQuestionOverrideChange}
            defaultSystemPrompt={botPromptConfig.system_prompt}
            defaultConversationStart={getDefaultConversationStart(
              question.order,
            )}
          />
        ))}
      </div>

      {/* Add Question Button */}
      <div className="flex justify-center">
        <Button
          type="button"
          variant="outline"
          onClick={handleAddQuestion}
          disabled={loading}
        >
          + Add Question
        </Button>
      </div>

      {/* Error Message */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Submit Buttons */}
      <div className="flex justify-center gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={(e) => handleSubmit(e, true)}
          disabled={loading}
        >
          {loading ? "Saving..." : "Save as Draft"}
        </Button>
        <Button type="submit" disabled={loading}>
          {loading
            ? mode === "edit"
              ? initialIsDraft
                ? "Publishing..."
                : "Updating..."
              : "Creating..."
            : mode === "edit"
              ? initialIsDraft
                ? "Publish"
                : "Update Assignment"
              : "Create Assignment"}
        </Button>
      </div>
    </form>
  );
}
