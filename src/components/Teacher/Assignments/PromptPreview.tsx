"use client";

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { BotPromptConfig, Question, Assignment } from "@/types/assignment";
import {
  interpolatePrompt,
  buildPreviewContext,
  InterpolationContext,
} from "@/lib/promptInterpolation";
import { TTS_INSTRUCTION } from "@/lib/promptTemplates";
import { Info, Eye, Volume2 } from "lucide-react";

interface PromptPreviewProps {
  config: BotPromptConfig;
  assignment: Partial<Assignment>;
  question?: Partial<Question>;
  languageCode?: string;
  assessmentMode?: "voice" | "text_chat" | "static_text";
  previewQuestionOrder?: 0 | 1; // 0 = first question, 1 = subsequent
}

/**
 * Preview component showing the interpolated prompt as it would appear at runtime.
 * Uses sample values for runtime variables with clear indication.
 */
export function PromptPreview({
  config,
  assignment,
  question,
  languageCode,
  assessmentMode = "voice",
  previewQuestionOrder = 0,
}: PromptPreviewProps) {
  // Build preview context with sample values
  const previewContext = useMemo((): InterpolationContext => {
    const baseContext = buildPreviewContext(assignment, question, languageCode);
    // Override question_order based on preview toggle
    return {
      ...baseContext,
      question_order: previewQuestionOrder,
    };
  }, [assignment, question, languageCode, previewQuestionOrder]);

  // Interpolate the system prompt
  const interpolatedSystemPrompt = useMemo(
    () => interpolatePrompt(config.system_prompt, previewContext),
    [config.system_prompt, previewContext]
  );

  // Interpolate the conversation start
  const interpolatedGreeting = useMemo(() => {
    const template =
      previewQuestionOrder === 0
        ? config.conversation_start.first_question
        : config.conversation_start.subsequent_questions;
    return interpolatePrompt(template, previewContext);
  }, [config.conversation_start, previewContext, previewQuestionOrder]);

  const isVoiceMode = assessmentMode === "voice";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Preview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info Banner */}
        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <span className="font-medium">Preview Mode:</span> Runtime variables
            like <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">attempt_number</code> and{" "}
            <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">question_order</code> are shown
            with sample values. Actual values will be used during assessment.
          </div>
        </div>

        {/* System Prompt Preview */}
        <div>
          <Label className="text-sm font-medium">System Prompt</Label>
          <div className="mt-2 p-3 bg-muted/50 rounded-lg border">
            <pre className="text-sm whitespace-pre-wrap font-sans">
              {interpolatedSystemPrompt}
            </pre>
            {/* TTS Instruction (for voice mode) */}
            {isVoiceMode && (
              <div className="mt-3 pt-3 border-t border-dashed">
                <div className="flex items-center gap-2 mb-1">
                  <Volume2 className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">
                    Auto-appended for voice mode:
                  </span>
                </div>
                <pre className="text-sm whitespace-pre-wrap font-sans text-muted-foreground italic">
                  {TTS_INSTRUCTION}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Conversation Start Preview */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-medium">
              Conversation Start{" "}
              <span className="text-muted-foreground font-normal">
                ({previewQuestionOrder === 0 ? "First Question" : "Subsequent Questions"})
              </span>
            </Label>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg border">
            <pre className="text-sm whitespace-pre-wrap font-sans">
              {interpolatedGreeting}
            </pre>
          </div>
        </div>

        {/* Preview Context Summary */}
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">Sample values used:</span>{" "}
          Language: {previewContext.language} |{" "}
          Attempt: {previewContext.attempt_number} |{" "}
          Question: {previewContext.question_order + 1} of {previewContext.total_questions}
        </div>
      </CardContent>
    </Card>
  );
}
