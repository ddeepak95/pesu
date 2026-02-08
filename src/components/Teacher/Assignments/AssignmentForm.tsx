"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MarkdownEditor from "@/components/Shared/MarkdownEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import QuestionCard from "@/components/Teacher/Assignments/QuestionCard";
import { PromptConfigEditor } from "@/components/Teacher/Assignments/PromptConfigEditor";
import { PromptPreview } from "@/components/Teacher/Assignments/PromptPreview";
import {
  Question,
  RubricItem,
  ResponderFieldConfig,
  BotPromptConfig,
} from "@/types/assignment";
import { supportedLanguages } from "@/utils/supportedLanguages";
import { getDefaultBotPromptConfig, getDefaultEvaluationPrompt } from "@/lib/promptTemplates";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus, ChevronDown, Bot, Eye } from "lucide-react";
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
  initialIsDraft?: boolean;
  onSubmit: (data: {
    title: string;
    questions: Question[];
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
    sharedContextEnabled?: boolean;
    sharedContext?: string;
    evaluationPrompt?: string;
    experienceRatingEnabled?: boolean;
    experienceRatingRequired?: boolean;
  }) => Promise<void>;
}

export default function AssignmentForm({
  mode,
  classId,
  assignmentId,
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
  initialAssessmentMode = "voice",
  initialResponderFieldsConfig,
  initialMaxAttempts = 3,
  initialBotPromptConfig,
  initialStudentInstructions = "",
  initialShowRubric = true,
  initialShowRubricPoints = true,
  initialUseStarDisplay = false,
  initialStarScale = 5,
  initialRequireAllAttempts = false,
  initialSharedContextEnabled = false,
  initialSharedContext = "",
  initialEvaluationPrompt = "",
  initialExperienceRatingEnabled = false,
  initialExperienceRatingRequired = false,
  initialIsDraft = false,
  onSubmit,
}: AssignmentFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [preferredLanguage, setPreferredLanguage] = useState(initialLanguage);
  const [lockLanguage, setLockLanguage] = useState(initialLockLanguage);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
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
    ]
  );
  const [botPromptConfig, setBotPromptConfig] = useState<BotPromptConfig>(
    initialBotPromptConfig || getDefaultBotPromptConfig()
  );
  const [studentInstructions, setStudentInstructions] = useState(
    initialStudentInstructions
  );
  const [showRubric, setShowRubric] = useState(initialShowRubric);
  const [showRubricPoints, setShowRubricPoints] = useState(
    initialShowRubricPoints
  );
  const [useStarDisplay, setUseStarDisplay] = useState(initialUseStarDisplay);
  const [starScale, setStarScale] = useState(initialStarScale);
  const [requireAllAttempts, setRequireAllAttempts] = useState(
    initialRequireAllAttempts
  );
  const [sharedContextEnabled, setSharedContextEnabled] = useState(
    initialSharedContextEnabled
  );
  const [sharedContext, setSharedContext] = useState(initialSharedContext);
  const [evaluationPrompt, setEvaluationPrompt] = useState(
    initialEvaluationPrompt || getDefaultEvaluationPrompt()
  );
  const [experienceRatingEnabled, setExperienceRatingEnabled] = useState(
    initialExperienceRatingEnabled
  );
  const [experienceRatingRequired, setExperienceRatingRequired] = useState(
    initialExperienceRatingRequired
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false);
  const [isBotConfigOpen, setIsBotConfigOpen] = useState(false);
  const [showBotPreview, setShowBotPreview] = useState(false);
  const [previewQuestionOrder, setPreviewQuestionOrder] = useState<0 | 1>(0);

  const handleQuestionChange = (
    questionIndex: number,
    field: keyof Question,
    value: Question[keyof Question]
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
    value: string | number
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
    rubricIndex: number
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
    override: import("@/types/assignment").QuestionPromptOverride | undefined
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

    // Validate shared context
    if (sharedContextEnabled && !sharedContext.trim()) {
      setError("Shared context text is required when Shared Context is enabled");
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
        (item) => item.item.trim() && item.points > 0
      );

      if (validRubricItems.length === 0) {
        setError(
          `Question ${i + 1}: At least one valid rubric item is required`
        );
        return;
      }

      // Validate that rubric points sum equals total points
      const rubricSum = validRubricItems.reduce(
        (sum, item) => sum + (item.points || 0),
        0
      );
      if (rubricSum !== question.total_points) {
        setError(
          `Question ${
            i + 1
          }: Rubric points (${rubricSum}) must equal total points (${
            question.total_points
          })`
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
        0
      );

      await onSubmit({
        title: title.trim(),
        questions: cleanedQuestions,
        totalPoints,
        preferredLanguage,
        lockLanguage,
        isPublic,
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
        experienceRatingRequired: experienceRatingEnabled ? experienceRatingRequired : false,
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
        err
      );
      setError(
        `Failed to ${
          mode === "edit" ? "update" : "create"
        } assignment. Please try again.`
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
          Assignment Title <span className="text-destructive">*</span>
        </Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={loading}
          placeholder="Enter assignment title"
        />
      </div>

      {/* Instructions (markdown) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="studentInstructions">Instructions (optional)</Label>
          <span className="text-xs text-muted-foreground">
            Markdown supported
          </span>
        </div>
        <MarkdownEditor
          id="studentInstructions"
          value={studentInstructions}
          onChange={setStudentInstructions}
          disabled={loading}
          placeholder="Enter instructions to display to students below the title..."
          rows={4}
        />
        <p className="text-sm text-muted-foreground">
          These instructions will be displayed to students below the title.
          Not passed to the AI.
        </p>
      </div>

      {/* Assessment Mode */}
      <div className="space-y-2">
        <Label htmlFor="assessmentMode">
          Assessment Type <span className="text-destructive">*</span>
        </Label>
        <Select
          value={assessmentMode}
          onValueChange={(value) =>
            setAssessmentMode(value as "voice" | "text_chat" | "static_text")
          }
          disabled={loading}
        >
          <SelectTrigger id="assessmentMode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="voice">Voice assessment</SelectItem>
            <SelectItem value="text_chat">Text chat assessment</SelectItem>
            <SelectItem value="static_text">Static text assessment</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* More Options */}
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
          <div className="space-y-4 p-4 pt-0 border-t">
            {/* Preferred Language */}
            <div className="space-y-2">
              <Label htmlFor="preferredLanguage">Preferred Language</Label>
              <Select
                value={preferredLanguage}
                onValueChange={setPreferredLanguage}
                disabled={loading}
              >
                <SelectTrigger id="preferredLanguage">
                  <SelectValue placeholder="Select a language" />
                </SelectTrigger>
                <SelectContent>
                  {supportedLanguages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Lock Language */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="lockLanguage"
                checked={lockLanguage}
                onCheckedChange={(checked) => setLockLanguage(checked === true)}
                disabled={loading}
              />
              <div className="space-y-1">
                <Label
                  htmlFor="lockLanguage"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Lock language for students
                </Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, students cannot change the interaction language
                  during the assessment
                </p>
              </div>
            </div>

            {/* Max Attempts */}
            <div className="space-y-2">
              <Label htmlFor="maxAttempts">Maximum Attempts</Label>
              <Input
                id="maxAttempts"
                type="number"
                min="1"
                value={maxAttempts}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  if (!isNaN(value) && value >= 1) {
                    setMaxAttempts(value);
                  }
                }}
                disabled={loading}
                placeholder="3"
              />
              <p className="text-sm text-muted-foreground">
                Number of attempts students can make for this assignment.
                Default is 3.
              </p>
            </div>

            {/* Rubric Visibility Settings */}
            <div className="space-y-3 p-4 border rounded-md">
              <Label className="text-sm font-medium">Rubric Visibility</Label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showRubric"
                  checked={showRubric}
                  onCheckedChange={(checked) => {
                    setShowRubric(checked === true);
                    // If hiding rubric, also hide points
                    if (!checked) {
                      setShowRubricPoints(false);
                    }
                  }}
                  disabled={loading}
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="showRubric"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Show rubric to students
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    When enabled, students can view the rubric criteria during
                    the assessment
                  </p>
                </div>
              </div>

              {showRubric && (
                <div className="flex items-center space-x-2 ml-6">
                  <Checkbox
                    id="showRubricPoints"
                    checked={showRubricPoints}
                    onCheckedChange={(checked) =>
                      setShowRubricPoints(checked === true)
                    }
                    disabled={loading}
                  />
                  <div className="space-y-1">
                    <Label
                      htmlFor="showRubricPoints"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      Show point values
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      When enabled, students can see how many points each rubric
                      item is worth
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Star Display Settings */}
            <div className="space-y-3 p-4 border rounded-md">
              <Label className="text-sm font-medium">
                Student Score Display
              </Label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="useStarDisplay"
                  checked={useStarDisplay}
                  onCheckedChange={(checked) =>
                    setUseStarDisplay(checked === true)
                  }
                  disabled={loading}
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="useStarDisplay"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Show scores as stars to students
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    When enabled, students see star ratings instead of point
                    scores
                  </p>
                </div>
              </div>

              {useStarDisplay && (
                <div className="ml-6 space-y-2">
                  <Label htmlFor="starScale" className="text-sm">
                    Star Scale
                  </Label>
                  <Input
                    id="starScale"
                    type="number"
                    min="1"
                    max="20"
                    value={starScale}
                    onChange={(e) =>
                      setStarScale(parseInt(e.target.value) || 5)
                    }
                    disabled={loading}
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">
                    Number of stars in the rating scale (e.g., 5 for a 5-star
                    scale). Students will see scores converted to this star
                    scale, while rubrics remain in points.
                  </p>
                </div>
              )}
            </div>

            {/* Completion Requirements */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="requireAllAttempts"
                checked={requireAllAttempts}
                onCheckedChange={(checked) =>
                  setRequireAllAttempts(checked === true)
                }
                disabled={loading}
              />
              <div className="space-y-1">
                <Label
                  htmlFor="requireAllAttempts"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Require all questions attempted to complete
                </Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, students must attempt all questions before they
                  can mark the assessment as complete
                </p>
              </div>
            </div>

            {/* Experience Rating */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="experienceRatingEnabled"
                  checked={experienceRatingEnabled}
                  onCheckedChange={(checked) => {
                    setExperienceRatingEnabled(checked === true);
                    if (!checked) setExperienceRatingRequired(false);
                  }}
                  disabled={loading}
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="experienceRatingEnabled"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Enable Experience Rating
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Ask students to rate their experience on a 5-point scale when
                    completing the assessment
                  </p>
                </div>
              </div>

              {experienceRatingEnabled && (
                <div className="flex items-center space-x-2 ml-6">
                  <Checkbox
                    id="experienceRatingRequired"
                    checked={experienceRatingRequired}
                    onCheckedChange={(checked) =>
                      setExperienceRatingRequired(checked === true)
                    }
                    disabled={loading}
                  />
                  <div className="space-y-1">
                    <Label
                      htmlFor="experienceRatingRequired"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      Require rating
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Students must provide a rating before completing (otherwise
                      they can skip)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Public Access Toggle */}
            <div className="flex items-center space-x-2 p-4 border rounded-md bg-muted/30">
              <Checkbox
                id="isPublic"
                checked={isPublic}
                onCheckedChange={(checked) => setIsPublic(checked === true)}
                disabled={loading}
              />
              <div className="space-y-1">
                <Label
                  htmlFor="isPublic"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Make this assignment publicly accessible
                </Label>
                <p className="text-sm text-muted-foreground">
                  Anyone with the link can view and complete this assignment
                  without logging in
                </p>
              </div>
            </div>

            {/* Responder Fields Configuration (only for public assignments) */}
            {isPublic && (
              <div className="space-y-4 p-4 border rounded-md">
                <div className="space-y-2">
                  <Label>Responder Information Fields</Label>
                  <p className="text-sm text-muted-foreground">
                    Configure what information to collect from public responders
                  </p>
                </div>

                {responderFieldsConfig.map((field, index) => (
                  <div key={index} className="p-4 border rounded-md space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">
                        Field {index + 1}
                      </Label>
                      {responderFieldsConfig.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const newFields = responderFieldsConfig.filter(
                              (_, i) => i !== index
                            );
                            setResponderFieldsConfig(newFields);
                          }}
                          disabled={loading}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`field-${index}-label`}>Label</Label>
                        <Input
                          id={`field-${index}-label`}
                          value={field.label}
                          onChange={(e) => {
                            const newFields = [...responderFieldsConfig];
                            newFields[index].label = e.target.value;
                            setResponderFieldsConfig(newFields);
                          }}
                          placeholder="e.g., Full Name"
                          disabled={loading}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`field-${index}-type`}>Type</Label>
                        <Select
                          value={field.type}
                          onValueChange={(value) => {
                            const newFields = [...responderFieldsConfig];
                            newFields[index].type =
                              value as ResponderFieldConfig["type"];
                            // Clear options if not select type
                            if (value !== "select") {
                              delete newFields[index].options;
                            }
                            setResponderFieldsConfig(newFields);
                          }}
                          disabled={loading}
                        >
                          <SelectTrigger id={`field-${index}-type`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="tel">Phone</SelectItem>
                            <SelectItem value="select">
                              Select (Dropdown)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`field-${index}-field`}>
                        Field Identifier
                      </Label>
                      <Input
                        id={`field-${index}-field`}
                        value={field.field}
                        onChange={(e) => {
                          const newFields = [...responderFieldsConfig];
                          newFields[index].field = e.target.value;
                          setResponderFieldsConfig(newFields);
                        }}
                        placeholder="e.g., name, email, organization"
                        disabled={loading}
                      />
                      <p className="text-xs text-muted-foreground">
                        Unique identifier for this field (used in data storage)
                      </p>
                    </div>

                    {field.type === "select" && (
                      <div className="space-y-2">
                        <Label htmlFor={`field-${index}-options`}>
                          Options (one per line)
                        </Label>
                        <textarea
                          id={`field-${index}-options`}
                          className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md"
                          value={field.options?.join("\n") || ""}
                          onChange={(e) => {
                            const newFields = [...responderFieldsConfig];
                            newFields[index].options = e.target.value
                              .split("\n")
                              .map((line) => line.trim())
                              .filter((line) => line.length > 0);
                            setResponderFieldsConfig(newFields);
                          }}
                          placeholder="Option 1&#10;Option 2&#10;Option 3"
                          disabled={loading}
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`field-${index}-required`}
                          checked={field.required}
                          onCheckedChange={(checked) => {
                            const newFields = [...responderFieldsConfig];
                            newFields[index].required = checked === true;
                            setResponderFieldsConfig(newFields);
                          }}
                          disabled={loading}
                        />
                        <Label
                          htmlFor={`field-${index}-required`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          Required field
                        </Label>
                      </div>

                      {field.type !== "select" && (
                        <div className="flex-1 space-y-2">
                          <Label htmlFor={`field-${index}-placeholder`}>
                            Placeholder
                          </Label>
                          <Input
                            id={`field-${index}-placeholder`}
                            value={field.placeholder || ""}
                            onChange={(e) => {
                              const newFields = [...responderFieldsConfig];
                              newFields[index].placeholder = e.target.value;
                              setResponderFieldsConfig(newFields);
                            }}
                            placeholder="Optional placeholder text"
                            disabled={loading}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const newField: ResponderFieldConfig = {
                      field: `field_${responderFieldsConfig.length + 1}`,
                      type: "text",
                      label: "",
                      required: false,
                    };
                    setResponderFieldsConfig([
                      ...responderFieldsConfig,
                      newField,
                    ]);
                  }}
                  disabled={loading}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Field
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI Bot Configuration */}
      <div className="border rounded-md">
        <button
          type="button"
          onClick={() => setIsBotConfigOpen(!isBotConfigOpen)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
          disabled={loading}
        >
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">AI Bot Configuration</h3>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${
              isBotConfigOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {isBotConfigOpen && (
          <div className="space-y-4 p-4 pt-0 border-t">
            <p className="text-sm text-muted-foreground">
              Customize how the AI bot interacts with students and evaluates
              answers. Use variable placeholders to insert dynamic content.
              {assessmentMode === "voice" && (
                <span className="block mt-1 text-xs">
                  Note: For voice mode, TTS formatting instructions are
                  automatically added.
                </span>
              )}
            </p>

            {/* Editor and Preview Toggle (only for voice and text_chat modes) */}
            {(assessmentMode === "voice" || assessmentMode === "text_chat") && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={showBotPreview ? "outline" : "default"}
                  size="sm"
                  onClick={() => setShowBotPreview(false)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant={showBotPreview ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowBotPreview(true)}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Preview
                </Button>
              </div>
            )}

            {showBotPreview && (assessmentMode === "voice" || assessmentMode === "text_chat") ? (
              <div className="space-y-3">
                {/* Preview Question Order Toggle */}
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Preview for:</span>
                  <Button
                    type="button"
                    variant={
                      previewQuestionOrder === 0 ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => setPreviewQuestionOrder(0)}
                  >
                    First Question
                  </Button>
                  <Button
                    type="button"
                    variant={
                      previewQuestionOrder === 1 ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => setPreviewQuestionOrder(1)}
                  >
                    Subsequent Questions
                  </Button>
                </div>

                <PromptPreview
                  config={botPromptConfig}
                  assignment={{
                    questions,
                    preferred_language: preferredLanguage,
                    max_attempts: maxAttempts,
                    shared_context: sharedContextEnabled ? sharedContext : undefined,
                  }}
                  question={questions[0]}
                  languageCode={preferredLanguage}
                  assessmentMode={assessmentMode}
                  previewQuestionOrder={previewQuestionOrder}
                />
              </div>
            ) : (
              <PromptConfigEditor
                config={botPromptConfig}
                onChange={setBotPromptConfig}
                disabled={loading}
                showBotPrompts={assessmentMode === "voice" || assessmentMode === "text_chat"}
                evaluationPrompt={evaluationPrompt}
                onEvaluationPromptChange={setEvaluationPrompt}
              />
            )}
          </div>
        )}
      </div>

      {/* Shared Context */}
      <div className="space-y-3 p-4 border rounded-md">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="sharedContextEnabled"
            checked={sharedContextEnabled}
            onCheckedChange={(checked) => setSharedContextEnabled(checked === true)}
            disabled={loading}
          />
          <div className="space-y-1">
            <Label
              htmlFor="sharedContextEnabled"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Shared Context
            </Label>
            <p className="text-sm text-muted-foreground">
              Provide a shared context (e.g. case study, passage, scenario) that
              will be included in all AI prompts for this assessment. This is not
              shown to students.
            </p>
          </div>
        </div>

        {sharedContextEnabled && (
          <div className="space-y-2 mt-3">
            <Label htmlFor="sharedContext">
              Context Text <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="sharedContext"
              value={sharedContext}
              onChange={(e) => setSharedContext(e.target.value)}
              disabled={loading}
              placeholder="Enter the shared context, case study, passage, or scenario that students will analyze..."
              rows={6}
              className="resize-y"
            />
            <p className="text-xs text-muted-foreground">
              This context will be included in all AI prompts but is not shown
              to students. Available as{" "}
              <code className="text-xs bg-muted px-1 rounded">
                {"{{shared_context}}"}
              </code>{" "}
              in prompt templates.
            </p>
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
            preferredLanguage={preferredLanguage}
            onChange={handleQuestionChange}
            onRubricChange={handleRubricChange}
            onAddRubricItem={handleAddRubricItem}
            onRemoveRubricItem={handleRemoveRubricItem}
            onMoveUp={handleMoveQuestionUp}
            onMoveDown={handleMoveQuestionDown}
            onDelete={handleDeleteQuestion}
            disabled={loading}
            // Bot override props - shown when assessment mode uses AI bot
            showBotOverride={
              assessmentMode === "voice" || assessmentMode === "text_chat"
            }
            questionOverride={
              botPromptConfig.question_overrides?.[question.order]
            }
            onQuestionOverrideChange={handleQuestionOverrideChange}
            defaultSystemPrompt={botPromptConfig.system_prompt}
            defaultConversationStart={getDefaultConversationStart(
              question.order
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
