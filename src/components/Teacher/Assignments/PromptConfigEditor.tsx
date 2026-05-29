"use client";

import React, { useRef, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  PROMPT_VARIABLES,
  getVariablesByCategory,
  getVariablesForGenerationPrompt,
  getMissingRequiredVariables,
  buildDefaultBotPromptConfig,
  buildDefaultEvaluationPrompt,
  buildDefaultDynamicGenerationPrompt,
  type ActivityType,
  type InteractionType,
} from "@/lib/promptTemplates";
import { BotPromptConfig } from "@/types/assignment";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertCircle, RotateCcw, Variable } from "lucide-react";

interface PromptConfigEditorProps {
  config: BotPromptConfig;
  onChange: (config: BotPromptConfig) => void;
  disabled?: boolean;
  /** Whether to show bot prompt tabs (system prompt, conversation start). False for static_text mode. */
  showBotPrompts?: boolean;
  /** Whether to show the multimodal-only "Ending the conversation" tab. */
  showEndConversation?: boolean;
  /** Rendered to the right of the prompt-type tab list (e.g. an Edit/Preview switch). */
  rightSlot?: React.ReactNode;
  /** Custom evaluation prompt value */
  evaluationPrompt?: string;
  /** Callback when evaluation prompt changes */
  onEvaluationPromptChange?: (value: string) => void;
  /** Used by "Reset to Default" to pick the right prompt combo */
  activityType?: ActivityType;
  /** Used by "Reset to Default" to pick the right prompt combo */
  interactionType?: InteractionType;
  /** Whether to show the dynamic question generation prompt tab */
  showDynamicGenerationPrompt?: boolean;
  /** Custom dynamic generation prompt value */
  dynamicGenerationPrompt?: string;
  /** Callback when dynamic generation prompt changes */
  onDynamicGenerationPromptChange?: (value: string) => void;
}

type VariableEntry = {
  key: string;
  placeholder: string;
  description: string;
};

type VariableGroup = {
  label?: string;
  variables: VariableEntry[];
};

/**
 * The Insert Variable panel that sits beside the active prompt textarea. The
 * variable list is scoped to the active tab (passed in via `groups`); when a
 * tab has no variables (e.g. "Ending the conversation") the panel is not
 * rendered at all by the caller.
 */
function VariablePanel({
  groups,
  onInsert,
  disabled,
}: {
  groups: VariableGroup[];
  onInsert: (placeholder: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3 md:w-64 md:shrink-0">
      <div className="flex items-center gap-2">
        <Variable className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Insert Variable</span>
      </div>
      {groups.map((group, i) => (
        <div key={group.label ?? i}>
          {group.label && (
            <span className="text-xs text-muted-foreground">{group.label}</span>
          )}
          <div className="mt-1 flex flex-wrap gap-1">
            {group.variables.map(({ key, placeholder, description }) => (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 font-mono text-xs"
                    onClick={() => onInsert(placeholder)}
                    disabled={disabled}
                    type="button"
                  >
                    {placeholder}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{description}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        <span className="font-medium">Conditional blocks:</span> Use{" "}
        <code className="rounded bg-muted px-1">
          {"{{#if variable}}...{{/if}}"}
        </code>{" "}
        to include content only when a variable has a value.
      </p>
    </div>
  );
}

/**
 * Editor component for configuring AI bot prompts.
 * Provides a tabbed interface for system prompt, conversation start, ending,
 * evaluation, and question generation prompts. Each tab shows an Insert
 * Variable panel beside the prompt box scoped to that tab's variables.
 */
export function PromptConfigEditor({
  config,
  onChange,
  disabled = false,
  showBotPrompts = true,
  showEndConversation = false,
  rightSlot,
  evaluationPrompt = "",
  onEvaluationPromptChange,
  activityType = "learning",
  interactionType = "voice",
  showDynamicGenerationPrompt = false,
  dynamicGenerationPrompt = "",
  onDynamicGenerationPromptChange,
}: PromptConfigEditorProps) {
  const systemPromptRef = useRef<HTMLTextAreaElement>(null);
  const firstQuestionRef = useRef<HTMLTextAreaElement>(null);
  const subsequentRef = useRef<HTMLTextAreaElement>(null);
  const evaluationRef = useRef<HTMLTextAreaElement>(null);
  const generationRef = useRef<HTMLTextAreaElement>(null);
  const defaultTab = showBotPrompts ? "system" : showDynamicGenerationPrompt ? "generation" : "evaluation";
  const [activeTab, setActiveTab] = React.useState(defaultTab);
  // Tracks which textarea last had focus so a variable inserts at its cursor.
  // The "ending" tab has no variables, so it never needs to be tracked here.
  const [activeTextarea, setActiveTextarea] = React.useState<
    "system" | "first" | "subsequent" | "evaluation" | "generation"
  >(showBotPrompts ? "system" : showDynamicGenerationPrompt ? "generation" : "evaluation");

  // Get missing required variables for validation
  const missingVariables = getMissingRequiredVariables(config.system_prompt);

  // Insert variable at cursor position in active textarea
  const insertVariable = useCallback(
    (placeholder: string) => {
      // Handle standalone prompt textareas (evaluation, generation)
      if (activeTextarea === "evaluation" || activeTextarea === "generation") {
        const ref = activeTextarea === "evaluation" ? evaluationRef : generationRef;
        const value = activeTextarea === "evaluation" ? evaluationPrompt : dynamicGenerationPrompt;
        const changeFn = activeTextarea === "evaluation" ? onEvaluationPromptChange : onDynamicGenerationPromptChange;
        const textarea = ref.current;
        if (!textarea || !changeFn) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue =
          value.substring(0, start) + placeholder + value.substring(end);

        changeFn(newValue);

        setTimeout(() => {
          textarea.focus();
          const newPosition = start + placeholder.length;
          textarea.setSelectionRange(newPosition, newPosition);
        }, 0);
        return;
      }

      let textareaRef: React.RefObject<HTMLTextAreaElement | null>;
      let field: "system_prompt" | "first_question" | "subsequent_questions";

      switch (activeTextarea) {
        case "system":
          textareaRef = systemPromptRef;
          field = "system_prompt";
          break;
        case "first":
          textareaRef = firstQuestionRef;
          field = "first_question";
          break;
        case "subsequent":
          textareaRef = subsequentRef;
          field = "subsequent_questions";
          break;
      }

      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentValue =
        field === "system_prompt"
          ? config.system_prompt
          : config.conversation_start[
              field as "first_question" | "subsequent_questions"
            ];

      const newValue =
        currentValue.substring(0, start) +
        placeholder +
        currentValue.substring(end);

      if (field === "system_prompt") {
        onChange({ ...config, system_prompt: newValue });
      } else {
        onChange({
          ...config,
          conversation_start: {
            ...config.conversation_start,
            [field]: newValue,
          },
        });
      }

      setTimeout(() => {
        textarea.focus();
        const newPosition = start + placeholder.length;
        textarea.setSelectionRange(newPosition, newPosition);
      }, 0);
    },
    [activeTextarea, config, onChange, evaluationPrompt, onEvaluationPromptChange, dynamicGenerationPrompt, onDynamicGenerationPromptChange]
  );

  const handleResetBotPrompts = useCallback(() => {
    onChange(buildDefaultBotPromptConfig(activityType, interactionType));
  }, [onChange, activityType, interactionType]);

  const handleResetEvaluation = useCallback(() => {
    onEvaluationPromptChange?.(buildDefaultEvaluationPrompt(activityType));
  }, [onEvaluationPromptChange, activityType]);

  const handleResetGeneration = useCallback(() => {
    onDynamicGenerationPromptChange?.(buildDefaultDynamicGenerationPrompt());
  }, [onDynamicGenerationPromptChange]);

  const updateEndConversation = useCallback(
    (instruction: string) => {
      const actions = config.multimodal_actions ?? {};
      onChange({
        ...config,
        multimodal_actions: {
          ...actions,
          endConversation: {
            ...actions.endConversation,
            customInstruction: instruction || undefined,
          },
        },
      });
    },
    [config, onChange]
  );

  // Variable groups available for the active tab. Empty = no panel rendered.
  const variableGroups: VariableGroup[] =
    activeTab === "ending"
      ? []
      : activeTab === "generation"
        ? [
            {
              label: "Available variables for question generation:",
              variables: getVariablesForGenerationPrompt(),
            },
          ]
        : [
            {
              label: "Static (known at config time):",
              variables: getVariablesByCategory("static"),
            },
            {
              label: "Runtime (actual values at assessment time):",
              variables: getVariablesByCategory("runtime"),
            },
          ];

  const variablePanel =
    variableGroups.length > 0 ? (
      <VariablePanel
        groups={variableGroups}
        onInsert={insertVariable}
        disabled={disabled}
      />
    ) : null;

  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-4">
      {/* Tabs for System Prompt, Conversation Start, Ending, Evaluation, and Question Generation */}
      <Tabs value={activeTab} onValueChange={(val) => {
        setActiveTab(val);
        if (val === "generation") setActiveTextarea("generation");
      }}>
        <div className="flex items-center justify-between gap-2">
          <TabsList className="flex">
            {showBotPrompts && (
              <>
                <TabsTrigger value="system">System Prompt</TabsTrigger>
                <TabsTrigger value="conversation">Conversation Start</TabsTrigger>
              </>
            )}
            {showEndConversation && (
              <TabsTrigger value="ending">Ending</TabsTrigger>
            )}
            <TabsTrigger value="evaluation">Evaluation Prompt</TabsTrigger>
            {showDynamicGenerationPrompt && (
              <TabsTrigger value="generation">Question Generation</TabsTrigger>
            )}
          </TabsList>
          {rightSlot}
        </div>

        {showBotPrompts && (
          <>
            <TabsContent value="system" className="space-y-3">
              <div className="flex flex-col gap-3 md:flex-row">
                <div className="flex-1 space-y-3">
                  <div>
                    <Label htmlFor="system-prompt">System Prompt</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Instructions for the AI bot. Use variables like{" "}
                      <code className="text-xs bg-muted px-1 rounded">
                        {"{{question_prompt}}"}
                      </code>{" "}
                      to insert dynamic content, or{" "}
                      <code className="text-xs bg-muted px-1 rounded">
                        {"{{#if variable}}...{{/if}}"}
                      </code>{" "}
                      for conditional sections.
                    </p>
                    <Textarea
                      id="system-prompt"
                      ref={systemPromptRef}
                      value={config.system_prompt}
                      onChange={(e) =>
                        onChange({ ...config, system_prompt: e.target.value })
                      }
                      onFocus={() => setActiveTextarea("system")}
                      disabled={disabled}
                      rows={12}
                      className="font-mono text-sm"
                      placeholder="Enter system prompt..."
                    />
                  </div>

                  {/* Validation Warning */}
                  {missingVariables.length > 0 && (
                    <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-yellow-800 dark:text-yellow-200">
                        <span className="font-medium">
                          Missing recommended variables:
                        </span>{" "}
                        {missingVariables.map((key) => (
                          <code
                            key={key}
                            className="bg-yellow-100 dark:bg-yellow-800 px-1 rounded mx-1"
                          >
                            {PROMPT_VARIABLES[key].placeholder}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {variablePanel}
              </div>
            </TabsContent>

            <TabsContent value="conversation" className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row">
                <div className="flex-1 space-y-4">
                  <div>
                    <Label htmlFor="first-question">First Question Greeting</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      How the bot starts the conversation for the first question.
                    </p>
                    <Textarea
                      id="first-question"
                      ref={firstQuestionRef}
                      value={config.conversation_start.first_question}
                      onChange={(e) =>
                        onChange({
                          ...config,
                          conversation_start: {
                            ...config.conversation_start,
                            first_question: e.target.value,
                          },
                        })
                      }
                      onFocus={() => setActiveTextarea("first")}
                      disabled={disabled}
                      rows={4}
                      className="font-mono text-sm"
                      placeholder="Enter first question greeting..."
                    />
                  </div>

                  <div>
                    <Label htmlFor="subsequent-questions">
                      Subsequent Questions Greeting
                    </Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      How the bot transitions to the 2nd, 3rd, etc. questions.
                    </p>
                    <Textarea
                      id="subsequent-questions"
                      ref={subsequentRef}
                      value={config.conversation_start.subsequent_questions}
                      onChange={(e) =>
                        onChange({
                          ...config,
                          conversation_start: {
                            ...config.conversation_start,
                            subsequent_questions: e.target.value,
                          },
                        })
                      }
                      onFocus={() => setActiveTextarea("subsequent")}
                      disabled={disabled}
                      rows={4}
                      className="font-mono text-sm"
                      placeholder="Enter subsequent questions greeting..."
                    />
                  </div>
                </div>
                {variablePanel}
              </div>
            </TabsContent>
          </>
        )}

        {showEndConversation && (
          <TabsContent value="ending" className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="end-custom">Ending the conversation</Label>
              <p className="text-xs text-muted-foreground">
                By default the tutor wraps up once the learner has engaged with
                and covered the topic, or if the learner goes off-topic or
                refuses to engage. Add any extra guidance below (optional).
              </p>
              <Textarea
                id="end-custom"
                placeholder="e.g. Wrap up once the student demonstrates understanding of the core idea."
                value={
                  config.multimodal_actions?.endConversation
                    ?.customInstruction ?? ""
                }
                onChange={(e) => updateEndConversation(e.target.value)}
                disabled={disabled}
                rows={4}
                className="text-sm"
              />
            </div>
          </TabsContent>
        )}

        <TabsContent value="evaluation" className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="flex-1 space-y-3">
              <div>
                <Label htmlFor="evaluation-prompt">Evaluation Prompt</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  This prompt is sent to the AI evaluator when scoring student
                  answers. Customize it to change how answers are evaluated and
                  feedback is generated.
                </p>
                <Textarea
                  id="evaluation-prompt"
                  ref={evaluationRef}
                  value={evaluationPrompt}
                  onChange={(e) => onEvaluationPromptChange?.(e.target.value)}
                  onFocus={() => setActiveTextarea("evaluation")}
                  disabled={disabled}
                  rows={12}
                  className="font-mono text-sm"
                  placeholder="Enter evaluation prompt template..."
                />
              </div>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetEvaluation}
                  disabled={disabled}
                  type="button"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset to Default
                </Button>
              </div>
            </div>
            {variablePanel}
          </div>
        </TabsContent>

        {showDynamicGenerationPrompt && (
          <TabsContent value="generation" className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="flex-1 space-y-3">
                <div>
                  <Label htmlFor="generation-prompt">Question Generation Prompt</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    This prompt is used as the system message when dynamically generating
                    questions from student file uploads. Customize it to control how
                    questions, rubrics, and expected answers are generated.
                  </p>
                  <Textarea
                    id="generation-prompt"
                    ref={generationRef}
                    value={dynamicGenerationPrompt}
                    onChange={(e) => onDynamicGenerationPromptChange?.(e.target.value)}
                    onFocus={() => setActiveTextarea("generation")}
                    disabled={disabled}
                    rows={16}
                    className="font-mono text-sm"
                    placeholder="Enter question generation prompt template..."
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetGeneration}
                    disabled={disabled}
                    type="button"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset to Default
                  </Button>
                </div>
              </div>
              {variablePanel}
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Reset Bot Prompts Button (only shown on the system/conversation tabs) */}
      {showBotPrompts && (activeTab === "system" || activeTab === "conversation") && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetBotPrompts}
            disabled={disabled}
            type="button"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Default
          </Button>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}
