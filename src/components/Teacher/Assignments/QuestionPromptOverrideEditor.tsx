"use client";

import React, { useRef, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PROMPT_VARIABLES,
  getVariablesByCategory,
} from "@/lib/promptTemplates";
import { QuestionPromptOverride } from "@/types/assignment";
import { Variable, RotateCcw } from "lucide-react";

interface QuestionPromptOverrideEditorProps {
  override: QuestionPromptOverride | undefined;
  onChange: (override: QuestionPromptOverride | undefined) => void;
  defaultSystemPrompt: string;
  defaultConversationStart: string;
  disabled?: boolean;
}

/**
 * Editor for per-question bot prompt overrides.
 * Allows overriding system prompt and conversation start for a specific question.
 */
export function QuestionPromptOverrideEditor({
  override,
  onChange,
  defaultSystemPrompt,
  defaultConversationStart,
  disabled = false,
}: QuestionPromptOverrideEditorProps) {
  const systemPromptRef = useRef<HTMLTextAreaElement>(null);
  const conversationStartRef = useRef<HTMLTextAreaElement>(null);
  const [activeTextarea, setActiveTextarea] = React.useState<
    "system" | "conversation"
  >("system");

  const isEnabled = override !== undefined;

  // Insert variable at cursor position in active textarea
  const insertVariable = useCallback(
    (placeholder: string) => {
      const textareaRef =
        activeTextarea === "system" ? systemPromptRef : conversationStartRef;
      const field =
        activeTextarea === "system" ? "system_prompt" : "conversation_start";

      const textarea = textareaRef.current;
      if (!textarea || !override) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentValue = override[field] || "";

      const newValue =
        currentValue.substring(0, start) +
        placeholder +
        currentValue.substring(end);

      onChange({
        ...override,
        [field]: newValue,
      });

      // Restore focus and cursor position after React re-render
      setTimeout(() => {
        textarea.focus();
        const newPosition = start + placeholder.length;
        textarea.setSelectionRange(newPosition, newPosition);
      }, 0);
    },
    [activeTextarea, override, onChange]
  );

  // Toggle override on/off
  const handleToggle = (checked: boolean) => {
    if (checked) {
      // Enable with default values
      onChange({
        system_prompt: defaultSystemPrompt,
        conversation_start: defaultConversationStart,
      });
    } else {
      // Disable - remove override
      onChange(undefined);
    }
  };

  // Reset to defaults
  const handleReset = () => {
    if (override) {
      onChange({
        system_prompt: defaultSystemPrompt,
        conversation_start: defaultConversationStart,
      });
    }
  };

  const staticVariables = getVariablesByCategory("static");
  const runtimeVariables = getVariablesByCategory("runtime");

  return (
    <div className="space-y-4">
      {/* Enable Override Toggle */}
      <div className="flex items-center space-x-2">
        <Checkbox
          id="enable-override"
          checked={isEnabled}
          onCheckedChange={handleToggle}
          disabled={disabled}
        />
        <Label
          htmlFor="enable-override"
          className="text-sm font-medium cursor-pointer"
        >
          Override bot behavior for this question
        </Label>
      </div>

      {isEnabled && override && (
        <>
          {/* Variable Insertion Toolbar */}
          <div className="border rounded-lg p-3 bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <Variable className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Insert Variable</span>
            </div>
            <div className="space-y-2">
              <div>
                <span className="text-xs text-muted-foreground">Static:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {staticVariables.map(({ key, placeholder }) => (
                    <Button
                      key={key}
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs font-mono px-2"
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
                <span className="text-xs text-muted-foreground">Runtime:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {runtimeVariables.map(({ key, placeholder }) => (
                    <Button
                      key={key}
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs font-mono px-2"
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

          {/* System Prompt Override */}
          <div className="space-y-2">
            <Label htmlFor="override-system-prompt">System Prompt</Label>
            <Textarea
              id="override-system-prompt"
              ref={systemPromptRef}
              value={override.system_prompt || ""}
              onChange={(e) =>
                onChange({ ...override, system_prompt: e.target.value })
              }
              onFocus={() => setActiveTextarea("system")}
              disabled={disabled}
              rows={8}
              className="font-mono text-sm"
              placeholder="Override system prompt for this question..."
            />
          </div>

          {/* Conversation Start Override */}
          <div className="space-y-2">
            <Label htmlFor="override-conversation-start">
              Conversation Start
            </Label>
            <p className="text-xs text-muted-foreground">
              How the bot starts the conversation for this specific question.
            </p>
            <Textarea
              id="override-conversation-start"
              ref={conversationStartRef}
              value={override.conversation_start || ""}
              onChange={(e) =>
                onChange({ ...override, conversation_start: e.target.value })
              }
              onFocus={() => setActiveTextarea("conversation")}
              disabled={disabled}
              rows={3}
              className="font-mono text-sm"
              placeholder="Override conversation start for this question..."
            />
          </div>

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
              Reset to Defaults
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
