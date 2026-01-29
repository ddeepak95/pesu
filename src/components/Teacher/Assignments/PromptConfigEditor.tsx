"use client";

import React, { useRef, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  PROMPT_VARIABLES,
  getVariablesByCategory,
  getMissingRequiredVariables,
  getDefaultBotPromptConfig,
} from "@/lib/promptTemplates";
import { BotPromptConfig } from "@/types/assignment";
import { AlertCircle, RotateCcw, Variable } from "lucide-react";

interface PromptConfigEditorProps {
  config: BotPromptConfig;
  onChange: (config: BotPromptConfig) => void;
  disabled?: boolean;
}

/**
 * Editor component for configuring AI bot prompts.
 * Provides a tabbed interface for system prompt and conversation start settings.
 */
export function PromptConfigEditor({
  config,
  onChange,
  disabled = false,
}: PromptConfigEditorProps) {
  const systemPromptRef = useRef<HTMLTextAreaElement>(null);
  const firstQuestionRef = useRef<HTMLTextAreaElement>(null);
  const subsequentRef = useRef<HTMLTextAreaElement>(null);
  const [activeTab, setActiveTab] = React.useState("system");
  const [activeTextarea, setActiveTextarea] = React.useState<
    "system" | "first" | "subsequent"
  >("system");

  // Get missing required variables for validation
  const missingVariables = getMissingRequiredVariables(config.system_prompt);

  // Insert variable at cursor position in active textarea
  const insertVariable = useCallback(
    (placeholder: string) => {
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

      // Restore focus and cursor position after React re-render
      setTimeout(() => {
        textarea.focus();
        const newPosition = start + placeholder.length;
        textarea.setSelectionRange(newPosition, newPosition);
      }, 0);
    },
    [activeTextarea, config, onChange]
  );

  // Reset to default configuration
  const handleReset = useCallback(() => {
    const defaultConfig = getDefaultBotPromptConfig();
    onChange(defaultConfig);
  }, [onChange]);

  const staticVariables = getVariablesByCategory("static");
  const runtimeVariables = getVariablesByCategory("runtime");

  return (
    <div className="space-y-4">
      {/* Variable Insertion Toolbar */}
      <div className="border rounded-lg p-3 bg-muted/30">
        <div className="flex items-center gap-2 mb-2">
          <Variable className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Insert Variable</span>
        </div>
        <div className="space-y-2">
          <div>
            <span className="text-xs text-muted-foreground">
              Static (known at config time):
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {staticVariables.map(({ key, placeholder }) => (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs font-mono"
                  onClick={() => insertVariable(placeholder)}
                  disabled={disabled}
                  type="button"
                >
                  {placeholder}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">
              Runtime (actual values at assessment time):
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {runtimeVariables.map(({ key, placeholder }) => (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs font-mono"
                  onClick={() => insertVariable(placeholder)}
                  disabled={disabled}
                  type="button"
                >
                  {placeholder}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs for System Prompt and Conversation Start */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="system">System Prompt</TabsTrigger>
          <TabsTrigger value="conversation">Conversation Start</TabsTrigger>
        </TabsList>

        <TabsContent value="system" className="space-y-3">
          <div>
            <Label htmlFor="system-prompt">System Prompt</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Instructions for the AI bot. Use variables like{" "}
              <code className="text-xs bg-muted px-1 rounded">
                {"{{question_prompt}}"}
              </code>{" "}
              to insert dynamic content.
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
        </TabsContent>

        <TabsContent value="conversation" className="space-y-4">
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
        </TabsContent>
      </Tabs>

      {/* Reset Button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          disabled={disabled}
          type="button"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset to Default
        </Button>
      </div>
    </div>
  );
}
