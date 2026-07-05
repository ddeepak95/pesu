"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AI_NOT_CONFIGURED_ERROR_CODE } from "@/lib/ai/credentials/constants";
import RubricItemRow from "@/components/Teacher/Assignments/RubricItemRow";
import { QuestionPromptOverrideEditor } from "@/components/Teacher/Assignments/QuestionPromptOverrideEditor";
import {
  Question,
  RubricItem,
  QuestionPromptOverride,
  teacherPromptOrFocus,
} from "@/types/assignment";
import { getActivityTypeLabels } from "@/lib/activityTypes/registry";
import type { ActivityType } from "@/lib/promptTemplates";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Sparkles,
  Loader2,
  Bot,
} from "lucide-react";

interface QuestionCardProps {
  question: Question;
  index: number;
  totalQuestions: number;
  onChange: (
    index: number,
    field: keyof Question,
    value: Question[keyof Question],
  ) => void;
  onRubricChange: (
    questionIndex: number,
    rubricIndex: number,
    field: keyof RubricItem,
    value: string | number,
  ) => void;
  onAddRubricItem: (questionIndex: number) => void;
  onRemoveRubricItem: (questionIndex: number, rubricIndex: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onDelete: (index: number) => void;
  disabled?: boolean;
  /** Hides add/remove/reorder/generate/override actions entirely (view mode) rather than just disabling them. */
  readOnly?: boolean;
  /** When true, per-question dynamic toggles are enabled. */
  fileSubmissionEnabled?: boolean;
  // Assignment-level context passed to AI generation
  title?: string;
  studentInstructions?: string;
  contextForAI?: string;
  // Bot prompt override props (optional - only shown when bot config is enabled)
  showBotOverride?: boolean;
  questionOverride?: QuestionPromptOverride;
  onQuestionOverrideChange?: (
    questionOrder: number,
    override: QuestionPromptOverride | undefined,
  ) => void;
  defaultSystemPrompt?: string;
  defaultConversationStart?: string;
  /** Class DB id for catalog-backed rubric generation. */
  classDbId?: string | null;
  /** Activity type — drives field labels (e.g. Question → Scenario). */
  activityType?: ActivityType;
}

const DYNAMIC_PROMPT_INFO_TOOLTIP =
  "Dynamic question: When on, each student's question is generated from their uploaded files and your guidelines for the question. Turn it off to write the exact question shown to everyone.";

const DYNAMIC_RUBRIC_INFO_TOOLTIP =
  "Dynamic rubric: When on, the rubric and expected answer are generated per student from their files when they continue past the upload step, instead of the fixed rubric you edit here.";

export default function QuestionCard({
  question,
  index,
  totalQuestions,
  onChange,
  onRubricChange,
  onAddRubricItem,
  onRemoveRubricItem,
  onMoveUp,
  onMoveDown,
  onDelete,
  disabled = false,
  readOnly = false,
  fileSubmissionEnabled = false,
  title,
  studentInstructions,
  contextForAI,
  showBotOverride = false,
  questionOverride,
  onQuestionOverrideChange,
  defaultSystemPrompt = "",
  defaultConversationStart = "",
  classDbId = null,
  activityType = "learning",
}: QuestionCardProps) {
  const labels = getActivityTypeLabels(activityType);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isBotOverrideOpen, setIsBotOverrideOpen] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [focusGuidance, setFocusGuidance] = useState("");
  const [genRubric, setGenRubric] = useState(true);
  const [genExpected, setGenExpected] = useState(true);

  const dynamicPrompt = question.dynamic_prompt === true;
  const dynamicRubric = question.dynamic_rubric === true;
  const togglesActive = fileSubmissionEnabled && !disabled;

  // Validate rubric points match total points (skip when rubric is generated later)
  const validateRubricPoints = () => {
    if (dynamicRubric) return null;
    const validRubricItems = question.rubric.filter(
      (item) => item.item.trim() && item.points > 0,
    );
    if (validRubricItems.length === 0) return null;

    const rubricSum = validRubricItems.reduce(
      (sum, item) => sum + (item.points || 0),
      0,
    );
    if (rubricSum !== question.total_points) {
      return `Rubric points (${rubricSum}) must equal total points (${question.total_points})`;
    }
    return null;
  };

  const rubricValidationError = validateRubricPoints();

  const handleGenerateWithAI = async () => {
    if (!genRubric && !genExpected) {
      setGenerationError(
        `Select at least one: generate ${labels.rubric.toLowerCase()} or ${labels.expectedAnswer.toLowerCase()}`,
      );
      return;
    }

    if (!teacherPromptOrFocus(question).trim()) {
      setGenerationError(
        dynamicPrompt
          ? `Please enter guidelines for the ${labels.questionNoun} first`
          : `Please enter a ${labels.questionNoun} first`,
      );
      return;
    }

    if (!question.total_points || question.total_points <= 0) {
      setGenerationError(
        `Please enter total points for this ${labels.questionNoun} first`,
      );
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const response = await fetch("/api/generate-rubric-and-answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          questionPrompt: teacherPromptOrFocus(question),
          supportingContent: question.supporting_content || undefined,
          title: title || undefined,
          instructions: studentInstructions || undefined,
          contextForAI: contextForAI || undefined,
          focusGuidance: focusGuidance.trim() || undefined,
          generateRubric: genRubric,
          generateExpectedAnswer: genExpected,
          classDbId: classDbId ?? undefined,
          activityType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (
          response.status === 503 &&
          errorData.code === AI_NOT_CONFIGURED_ERROR_CODE
        ) {
          throw new Error(
            "AI is not configured for this class. Set up providers and the Rubric generation app function in AI settings.",
          );
        }
        throw new Error(
          errorData.error || "Failed to generate rubric and answer",
        );
      }

      const data = await response.json();

      if (genExpected) {
        onChange(index, "expected_answer", data.expectedAnswer || "");
      }

      if (!genRubric) {
        return;
      }

      const newRubric = data.rubric.map((item: RubricItem) => ({ ...item }));

      let finalRubric: RubricItem[];
      let finalTotalPoints: number;

      if (question.total_points > 0) {
        const totalPoints = question.total_points;
        const totalAIPoints = newRubric.reduce(
          (sum: number, item: RubricItem) => sum + item.points,
          0,
        );

        if (totalAIPoints > 0) {
          let distributedSum = 0;
          const distributedRubric = newRubric.map(
            (item: RubricItem, idx: number) => {
              if (idx === newRubric.length - 1) {
                const points = totalPoints - distributedSum;
                distributedSum += points;
                return { ...item, points };
              } else {
                const points = Math.round(
                  (item.points / totalAIPoints) * totalPoints,
                );
                distributedSum += points;
                return { ...item, points };
              }
            },
          );
          finalRubric = distributedRubric.map((item: RubricItem) => ({
            ...item,
          }));
          finalTotalPoints = totalPoints;
        } else {
          const pointsPerItem = Math.floor(totalPoints / newRubric.length);
          const remainder = totalPoints % newRubric.length;
          const distributedRubric = newRubric.map(
            (item: RubricItem, idx: number) => ({
              ...item,
              points: pointsPerItem + (idx < remainder ? 1 : 0),
            }),
          );
          finalRubric = distributedRubric.map((item: RubricItem) => ({
            ...item,
          }));
          finalTotalPoints = totalPoints;
        }
      } else {
        finalTotalPoints = newRubric.reduce(
          (sum: number, item: RubricItem) => sum + item.points,
          0,
        );
        finalRubric = newRubric.map((item: RubricItem) => ({ ...item }));
      }

      const rubricCopy = finalRubric.map((item: RubricItem) => ({
        item: String(item.item || ""),
        points: Number(item.points || 0),
      }));

      onChange(index, "rubric", rubricCopy);

      if (question.total_points !== finalTotalPoints) {
        onChange(index, "total_points", finalTotalPoints);
      }
    } catch (error) {
      console.error("Error generating rubric and answer:", error);
      setGenerationError(
        error instanceof Error ? error.message : "Failed to generate content",
      );
    } finally {
      setIsGenerating(false);
      setFocusGuidance("");
    }
  };

  return (
    <div className="border rounded-lg p-6 space-y-4 bg-card">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {labels.question} {index + 1}
        </h3>
        {!readOnly && (
          <div className="flex gap-2">
            {showBotOverride && onQuestionOverrideChange && (
              <Button
                type="button"
                variant={questionOverride ? "default" : "ghost"}
                size="icon"
                onClick={() => setIsBotOverrideOpen(true)}
                disabled={disabled}
                title="Configure bot behavior for this question"
                className={
                  questionOverride ? "bg-primary/90 hover:bg-primary" : ""
                }
              >
                <Bot className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onMoveUp(index)}
              disabled={disabled || index === 0}
              title="Move up"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onMoveDown(index)}
              disabled={disabled || index === totalQuestions - 1}
              title="Move down"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onDelete(index)}
              disabled={disabled || totalQuestions === 1}
              title="Delete question"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`totalPoints-${index}`}>
          Total Points <span className="text-destructive">*</span>
        </Label>
        <Input
          id={`totalPoints-${index}`}
          type="number"
          value={question.total_points || ""}
          onChange={(e) => {
            const value = parseInt(e.target.value, 10);
            onChange(
              index,
              "total_points",
              isNaN(value) ? 0 : Math.max(0, value),
            );
          }}
          disabled={disabled && !readOnly}
          readOnly={readOnly}
          min={0}
          className="w-32"
        />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label
            htmlFor={`prompt-${index}`}
            className="text-sm font-medium min-w-0 flex-1"
          >
            {dynamicPrompt ? "Guidelines for the question" : labels.question}{" "}
            <span className="text-destructive">*</span>
          </Label>
          <div className="flex items-center gap-2 shrink-0">
            <InfoTooltip text={DYNAMIC_PROMPT_INFO_TOOLTIP} />
            <span className="text-xs text-muted-foreground">Dynamic</span>
            <Switch
              id={`dynamic-prompt-${index}`}
              checked={dynamicPrompt}
              onCheckedChange={(checked) => {
                onChange(index, "dynamic_prompt", checked);
              }}
              disabled={!togglesActive}
            />
          </div>
        </div>
        <Textarea
          id={`prompt-${index}`}
          value={
            dynamicPrompt
              ? (question.question_focus ?? "")
              : question.prompt
          }
          onChange={(e) =>
            dynamicPrompt
              ? onChange(index, "question_focus", e.target.value)
              : onChange(index, "prompt", e.target.value)
          }
          disabled={disabled && !readOnly}
          readOnly={readOnly}
          placeholder={
            dynamicPrompt
              ? "Describe what the generated question should cover (guidelines for the AI)"
              : labels.questionPlaceholder
          }
          rows={4}
        />
      </div>

      {!readOnly && (
        <>
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowGenerateDialog(true)}
          disabled={
            disabled ||
            isGenerating ||
            dynamicRubric ||
            !teacherPromptOrFocus(question).trim() ||
            !question.total_points ||
            question.total_points <= 0
          }
          className="w-full"
          title={
            dynamicRubric
              ? "Turn off dynamic rubric to generate rubric and expected answer here"
              : undefined
          }
        >
          <Sparkles className="h-4 w-4 mr-2" />
          {isGenerating
            ? "Generating..."
            : `Generate ${labels.rubric} & ${labels.expectedAnswer} with AI`}
        </Button>
        {isGenerating && (
          <div className="flex items-center gap-2 p-4 border rounded-md bg-muted/30">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <div className="text-sm">
              <p className="font-medium">
                AI is processing your {labels.questionNoun}...
              </p>
              <p className="text-muted-foreground">
                Detecting language and generating content
              </p>
            </div>
          </div>
        )}
        {generationError && (
          <p className="text-sm text-destructive">{generationError}</p>
        )}
      </div>

      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Generate {labels.rubric} &amp; {labels.expectedAnswer}
            </DialogTitle>
            <DialogDescription>
              Choose what to generate. The model uses your{" "}
              {dynamicPrompt
                ? `guidelines for the ${labels.questionNoun}`
                : labels.questionNoun}{" "}
              text
              {focusGuidance.trim()
                ? " and your extra instructions below."
                : "."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id={`gen-rubric-${index}`}
                checked={genRubric}
                onCheckedChange={(c) => setGenRubric(c === true)}
              />
              <Label
                htmlFor={`gen-rubric-${index}`}
                className="font-normal cursor-pointer"
              >
                Generate {labels.rubric.toLowerCase()}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id={`gen-expected-${index}`}
                checked={genExpected}
                onCheckedChange={(c) => setGenExpected(c === true)}
              />
              <Label
                htmlFor={`gen-expected-${index}`}
                className="font-normal cursor-pointer"
              >
                Generate {labels.expectedAnswer.toLowerCase()}
              </Label>
            </div>
            <Textarea
              id={`focusGuidance-${index}`}
              value={focusGuidance}
              onChange={(e) => setFocusGuidance(e.target.value)}
              placeholder="Optional: level of students, topic focus, etc."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowGenerateDialog(false);
                setFocusGuidance("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!genRubric && !genExpected) return;
                setShowGenerateDialog(false);
                handleGenerateWithAI();
              }}
              disabled={isGenerating || (!genRubric && !genExpected)}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </>
      )}

      {!dynamicRubric ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm font-medium">
              {labels.rubric} <span className="text-destructive">*</span>
            </Label>
            <div className="flex items-center gap-2 shrink-0">
              <InfoTooltip text={DYNAMIC_RUBRIC_INFO_TOOLTIP} />
              <span className="text-xs text-muted-foreground">Dynamic</span>
              <Switch
                id={`dynamic-rubric-${index}`}
                checked={dynamicRubric}
                onCheckedChange={(checked) => {
                  onChange(index, "dynamic_rubric", checked);
                }}
                disabled={!togglesActive}
              />
            </div>
          </div>
          <div className="flex gap-8 mt-2 text-sm text-muted-foreground">
            <span>{labels.rubricItemNoun}</span>
            <span className="ml-auto">Points</span>
          </div>

          <div className="space-y-2">
            {question.rubric.map((item, rubricIndex) => (
              <RubricItemRow
                key={rubricIndex}
                item={item}
                index={rubricIndex}
                onChange={(rubricIdx, field, value) =>
                  onRubricChange(index, rubricIdx, field, value)
                }
                onRemove={(rubricIdx) => onRemoveRubricItem(index, rubricIdx)}
                disabled={disabled}
                hideRemove={readOnly}
                readOnly={readOnly}
                itemPlaceholder={labels.rubricItemPlaceholder}
              />
            ))}
          </div>

          {rubricValidationError && (
            <p className="text-sm text-destructive">{rubricValidationError}</p>
          )}

          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onAddRubricItem(index)}
              disabled={disabled}
              size="sm"
            >
              Add {labels.rubricItemNoun}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2 rounded-md border border-dashed p-4 bg-muted/20">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm font-medium">{labels.rubric}</Label>
            <div className="flex items-center gap-2 shrink-0">
              <InfoTooltip text={DYNAMIC_RUBRIC_INFO_TOOLTIP} />
              <span className="text-xs text-muted-foreground">Dynamic</span>
              <Switch
                id={`dynamic-rubric-on-${index}`}
                checked={dynamicRubric}
                onCheckedChange={(checked) => {
                  onChange(index, "dynamic_rubric", checked);
                }}
                disabled={!togglesActive}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Rubric and expected answer will be generated from each
            student&apos;s uploaded files when they continue past the upload
            step.
          </p>
        </div>
      )}

      {!dynamicRubric && (
        <div className="space-y-2">
          <Label htmlFor={`expectedAnswer-${index}`}>{labels.expectedAnswer}</Label>
          <Textarea
            id={`expectedAnswer-${index}`}
            value={question.expected_answer || ""}
            onChange={(e) => onChange(index, "expected_answer", e.target.value)}
            disabled={disabled && !readOnly}
            readOnly={readOnly}
            placeholder={labels.expectedAnswerPlaceholder}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            {labels.expectedAnswerHelp}
          </p>
        </div>
      )}


      {!readOnly && showBotOverride && onQuestionOverrideChange && (
        <Dialog open={isBotOverrideOpen} onOpenChange={setIsBotOverrideOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Bot Behavior for {labels.question} {index + 1}
              </DialogTitle>
              <DialogDescription>
                Customize how the AI bot interacts with students for this
                specific question. Leave disabled to use the assignment-level
                settings.
              </DialogDescription>
            </DialogHeader>
            <QuestionPromptOverrideEditor
              override={questionOverride}
              onChange={(override) =>
                onQuestionOverrideChange(question.order, override)
              }
              defaultSystemPrompt={defaultSystemPrompt}
              defaultConversationStart={defaultConversationStart}
              disabled={disabled}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
