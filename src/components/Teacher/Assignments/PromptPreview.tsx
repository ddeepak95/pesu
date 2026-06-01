"use client";

import React, { useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { BotPromptConfig, Question, Assignment } from "@/types/assignment";
import {
  interpolatePrompt,
  buildPreviewContext,
  InterpolationContext,
} from "@/lib/promptInterpolation";
import {
  CHAT_SYSTEM_APPENDIX,
  VOICE_SYSTEM_APPENDIX,
} from "@/lib/promptTemplates";
import { Info, MessageSquare, Volume2 } from "lucide-react";
import type { AssessmentMode } from "@/lib/settings/registry";

interface PromptPreviewProps {
  config: BotPromptConfig;
  assignment: Partial<Assignment>;
  question?: Partial<Question>;
  languageCode?: string;
  assessmentMode?: AssessmentMode;
  /** Mirror the editor's tab visibility so the preview shows the same set. */
  showBotPrompts?: boolean;
  showEndConversation?: boolean;
  showDynamicGenerationPrompt?: boolean;
  evaluationPrompt?: string;
  dynamicGenerationPrompt?: string;
  /** Rendered to the right of the prompt-type tab list (e.g. an Edit/Preview switch). */
  rightSlot?: React.ReactNode;
}

/** A single rendered prompt block (interpolated text in a muted box). */
function PreviewBlock({ text }: { text: string }) {
  return (
    <div className="rounded-lg border bg-muted/50 p-3">
      <pre className="whitespace-pre-wrap font-sans text-sm">{text}</pre>
    </div>
  );
}

/**
 * Preview component showing the interpolated prompts as they would appear at
 * runtime. Organized into the same category tabs as the editor (system,
 * conversation start, ending, evaluation, question generation). Runtime
 * variables are shown with sample values.
 */
export function PromptPreview({
  config,
  assignment,
  question,
  languageCode,
  assessmentMode = "voice",
  showBotPrompts = true,
  showEndConversation = false,
  showDynamicGenerationPrompt = false,
  evaluationPrompt = "",
  dynamicGenerationPrompt = "",
  rightSlot,
}: PromptPreviewProps) {
  // Preview the configured support language (when enabled) so {{support_language}}
  // blocks render as they would for a learner who has it selected.
  const previewSupportLanguage = config.multimodal_actions?.languageSupport?.enabled
    ? config.multimodal_actions.languageSupport.defaultLanguage
    : undefined;

  // Build preview context with sample values
  const previewContext = useMemo(
    (): InterpolationContext =>
      buildPreviewContext(assignment, question, languageCode, previewSupportLanguage),
    [assignment, question, languageCode, previewSupportLanguage]
  );

  // Interpolate the system prompt
  const interpolatedSystemPrompt = useMemo(
    () => interpolatePrompt(config.system_prompt, previewContext),
    [config.system_prompt, previewContext]
  );

  // Interpolate both conversation-start greetings (first uses question_order 0,
  // subsequent uses 1 so any {{question_order}} usage reads correctly).
  const interpolatedFirstGreeting = useMemo(
    () =>
      interpolatePrompt(config.conversation_start.first_question, {
        ...previewContext,
        question_order: 0,
      }),
    [config.conversation_start.first_question, previewContext]
  );

  const interpolatedSubsequentGreeting = useMemo(
    () =>
      interpolatePrompt(config.conversation_start.subsequent_questions, {
        ...previewContext,
        question_order: 1,
      }),
    [config.conversation_start.subsequent_questions, previewContext]
  );

  const interpolatedEvaluation = useMemo(
    () => interpolatePrompt(evaluationPrompt, previewContext),
    [evaluationPrompt, previewContext]
  );

  const interpolatedGeneration = useMemo(() => {
    // generation_spec is a runtime-only variable not in the preview context;
    // seed a sample so the preview doesn't show a raw placeholder.
    const generationContext = {
      ...previewContext,
      generation_spec: "[Generation instructions will appear here]",
    };
    return interpolatePrompt(dynamicGenerationPrompt, generationContext);
  }, [dynamicGenerationPrompt, previewContext]);

  const endingInstruction =
    config.multimodal_actions?.endConversation?.customInstruction?.trim() ?? "";

  /** Matches useInterpolatedPrompts: voice and text_chat append these; static_text does not. */
  const modalityAppendix = useMemo(() => {
    if (assessmentMode === "text_chat") {
      return CHAT_SYSTEM_APPENDIX.replace(
        /\{\{language\}\}/g,
        previewContext.language,
      );
    }
    if (assessmentMode === "voice") {
      return VOICE_SYSTEM_APPENDIX;
    }
    return null;
  }, [assessmentMode, previewContext.language]);

  const appendixLabel =
    assessmentMode === "voice"
      ? "Auto-appended for voice mode:"
      : "Auto-appended for text chat mode:";

  const defaultTab = showBotPrompts
    ? "system"
    : showDynamicGenerationPrompt
      ? "generation"
      : "evaluation";

  return (
    <div className="space-y-4">
      <Tabs defaultValue={defaultTab}>
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

        {/* Info Banner */}
        <div className="mt-2 flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <span className="font-medium">Preview Mode:</span> Runtime variables
            like <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">attempt_number</code> and{" "}
            <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">question_order</code> are shown
            with sample values. Actual values will be used during assessment.
          </div>
        </div>

        {showBotPrompts && (
          <>
            <TabsContent value="system" className="space-y-2">
              <Label className="text-sm font-medium">System Prompt</Label>
              <div className="rounded-lg border bg-muted/50 p-3">
                <pre className="whitespace-pre-wrap font-sans text-sm">
                  {interpolatedSystemPrompt}
                </pre>
                {modalityAppendix && (
                  <div className="mt-3 pt-3 border-t border-dashed">
                    <div className="flex items-center gap-2 mb-1">
                      {assessmentMode === "voice" ? (
                        <Volume2 className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <MessageSquare className="h-3 w-3 text-muted-foreground" />
                      )}
                      <span className="text-xs text-muted-foreground font-medium">
                        {appendixLabel}
                      </span>
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground italic">
                      {modalityAppendix}
                    </pre>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="conversation" className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  First Question Greeting
                </Label>
                <PreviewBlock text={interpolatedFirstGreeting} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Subsequent Questions Greeting
                </Label>
                <PreviewBlock text={interpolatedSubsequentGreeting} />
              </div>
            </TabsContent>
          </>
        )}

        {showEndConversation && (
          <TabsContent value="ending" className="space-y-2">
            <Label className="text-sm font-medium">Ending the conversation</Label>
            {endingInstruction ? (
              <PreviewBlock text={endingInstruction} />
            ) : (
              <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
                Using the default ending behavior: the tutor wraps up once the
                learner has covered the topic, or if the learner goes off-topic
                or refuses to engage. Add custom guidance in the Edit tab to
                augment this.
              </p>
            )}
          </TabsContent>
        )}

        <TabsContent value="evaluation" className="space-y-2">
          <Label className="text-sm font-medium">Evaluation Prompt</Label>
          {evaluationPrompt ? (
            <PreviewBlock text={interpolatedEvaluation} />
          ) : (
            <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
              Using the default evaluation prompt.
            </p>
          )}
        </TabsContent>

        {showDynamicGenerationPrompt && (
          <TabsContent value="generation" className="space-y-2">
            <Label className="text-sm font-medium">
              Question Generation Prompt
            </Label>
            {dynamicGenerationPrompt ? (
              <PreviewBlock text={interpolatedGeneration} />
            ) : (
              <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
                Using the default question generation prompt.
              </p>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Preview Context Summary */}
      <div className="text-xs text-muted-foreground">
        <span className="font-medium">Sample values used:</span>{" "}
        Language: {previewContext.language} |{" "}
        Attempt: {previewContext.attempt_number} |{" "}
        Question: {previewContext.question_order + 1} of {previewContext.total_questions}
      </div>
    </div>
  );
}
