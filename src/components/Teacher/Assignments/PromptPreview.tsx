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
  buildDefaultDynamicGenerationPrompt,
  buildDynamicGenerationUserMessage,
  CHAT_SYSTEM_APPENDIX,
  VOICE_SYSTEM_APPENDIX,
} from "@/lib/promptTemplates";
import { Info } from "lucide-react";
import type { AssessmentMode } from "@/lib/settings/registry";
import type { TemplateDefinition as RealTemplateDefinition } from "@/lib/activityTypes/templates";
import {
  buildEndConversationDirective,
  buildMultimodalDirectives,
} from "@/lib/ai/multimodal-directives";
import { EVALUATION_SYSTEM_SHARED_FOOTER } from "@/lib/activityTypes/registry";
import {
  appendFeedbackFocusBlock,
  buildDefaultEvaluationUserMessage,
} from "@/lib/ai/evaluationPromptText";
import {
  buildFeedbackFocusPromptText,
  type FeedbackFocusArea,
} from "@/lib/feedbackFocus";

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
  /** Assignment-level full override of the dynamic-generation system message, if set. */
  dynamicGenerationPrompt?: string;
  /**
   * Template-level `generation.dynamicGenerationGuidance` fragment — appended
   * inside the real default wrapper (`buildDefaultDynamicGenerationPrompt`)
   * when no full override (`dynamicGenerationPrompt`) is set.
   */
  dynamicGenerationTypeGuidance?: string;
  /** Rendered to the right of the prompt-type tab list (e.g. an Edit/Preview switch). */
  rightSlot?: React.ReactNode;
  /**
   * The full, persisted-shape template definition (e.g. from
   * `fromEditorDefinition()`) — required to compute `buildMultimodalDirectives`
   * below. Omit to keep the legacy client-interpolation-only preview.
   */
  activityDefinitionSnapshot?: RealTemplateDefinition;
  /**
   * When true (multimodal interactionType), additionally renders the
   * server-appended "[Multimodal turn instructions]" block (actions, end
   * condition, action guidance, language support) on top of the base
   * interpolated system prompt, and renders the Ending tab from the real
   * composed end-conversation directive.
   */
  showMultimodalDirectives?: boolean;
  /** Overrides the config-derived support-language lookup below. */
  languageSupportEnabled?: boolean;
  /** Overrides the config-derived support-language lookup below. */
  supportLanguageCode?: string;
  /**
   * When provided (alongside `evaluationPrompt`), renders the full evaluation
   * exchange — system message (persona + shared footer) and user message
   * (custom prompt or the real built-in template, plus the feedback-focus
   * block) — instead of just the raw `evaluationPrompt` field.
   */
  evaluationSystemPersona?: string;
  feedbackFocusAreas?: FeedbackFocusArea[];
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
  dynamicGenerationTypeGuidance,
  rightSlot,
  activityDefinitionSnapshot,
  showMultimodalDirectives = false,
  languageSupportEnabled,
  supportLanguageCode,
  evaluationSystemPersona,
  feedbackFocusAreas,
}: PromptPreviewProps) {
  // Preview the configured support language (when enabled) so {{support_language}}
  // blocks render as they would for a learner who has it selected. Explicit
  // `languageSupportEnabled`/`supportLanguageCode` props (callers with no
  // per-assignment BotPromptConfig, e.g. the template editor) take priority
  // over reading them off `config`; falls back to a generic sample language
  // when enabled but no specific code is known.
  const effectiveLanguageSupportEnabled =
    languageSupportEnabled ??
    Boolean(config.multimodal_actions?.languageSupport?.enabled);
  const previewSupportLanguage =
    supportLanguageCode ??
    (config.multimodal_actions?.languageSupport?.enabled
      ? config.multimodal_actions.languageSupport.defaultLanguage
      : undefined) ??
    (effectiveLanguageSupportEnabled ? "es" : undefined);

  // Build preview context with sample values
  const previewContext = useMemo(
    (): InterpolationContext =>
      buildPreviewContext(
        assignment,
        question,
        languageCode,
        effectiveLanguageSupportEnabled ? previewSupportLanguage : undefined,
      ),
    [assignment, question, languageCode, effectiveLanguageSupportEnabled, previewSupportLanguage]
  );

  const multimodalDirectives = useMemo(() => {
    if (!showMultimodalDirectives || !activityDefinitionSnapshot) return null;
    return buildMultimodalDirectives({
      availableActions:
        activityDefinitionSnapshot.defaults?.multimodal?.availableActions ?? [],
      languageHelpAvailable:
        effectiveLanguageSupportEnabled && previewContext.support_language
          ? { languageLabel: previewContext.support_language }
          : undefined,
      primaryLanguageLabel: previewContext.language,
      activityType: "learning",
      activityDefinitionSnapshot,
    });
  }, [
    showMultimodalDirectives,
    activityDefinitionSnapshot,
    effectiveLanguageSupportEnabled,
    previewContext.support_language,
    previewContext.language,
  ]);

  const endingDirectiveText = useMemo(() => {
    if (!showMultimodalDirectives || !activityDefinitionSnapshot) return null;
    return buildEndConversationDirective({
      endConditionInstruction: activityDefinitionSnapshot.endConditionInstruction,
    });
  }, [showMultimodalDirectives, activityDefinitionSnapshot]);

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

  // Fuller evaluation preview (system message + real user-message recipe) is
  // only computed when the caller opts in via `evaluationSystemPersona` —
  // otherwise this stays null and the evaluation tab falls back to just
  // showing the raw `evaluationPrompt` field, unchanged from before.
  const evaluationSystemMessage = useMemo(() => {
    if (evaluationSystemPersona === undefined) return null;
    return `${evaluationSystemPersona}\n\n${EVALUATION_SYSTEM_SHARED_FOOTER}`;
  }, [evaluationSystemPersona]);

  const evaluationUserMessage = useMemo(() => {
    if (evaluationSystemPersona === undefined) return null;
    const base = evaluationPrompt
      ? interpolatedEvaluation
      : buildDefaultEvaluationUserMessage({
          questionPrompt: previewContext.question_prompt,
          rubric: question?.rubric ?? [],
          answerText: previewContext.answer_text,
          languageName: previewContext.language,
          sharedContext: previewContext.context_for_ai,
        });
    return appendFeedbackFocusBlock(
      base,
      buildFeedbackFocusPromptText(feedbackFocusAreas ?? []),
    );
  }, [
    evaluationSystemPersona,
    evaluationPrompt,
    interpolatedEvaluation,
    previewContext,
    question,
    feedbackFocusAreas,
  ]);

  // Real recipe (generate-dynamic-questions/route.ts): the assignment's own
  // full override verbatim if set, else the real default wrapper template
  // with the template's own generation guidance embedded — not just the raw
  // guidance fragment shown in isolation.
  const generationSystemMessage = useMemo(() => {
    const base = dynamicGenerationPrompt.trim()
      ? dynamicGenerationPrompt
      : buildDefaultDynamicGenerationPrompt(dynamicGenerationTypeGuidance);
    // generation_spec is a runtime-only variable not in the preview context;
    // seed a sample so the preview doesn't show a raw placeholder.
    const generationContext = {
      ...previewContext,
      generation_spec: "[Generation instructions will appear here]",
    };
    return interpolatePrompt(base, generationContext);
  }, [dynamicGenerationPrompt, dynamicGenerationTypeGuidance, previewContext]);

  const generationUserMessage = useMemo(
    () => buildDynamicGenerationUserMessage(previewContext.total_questions),
    [previewContext.total_questions],
  );

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

  // Concatenated exactly as runtime does (systemPrompt += appendix /
  // system = systemPrompt + directives, no separator inserted) so the
  // preview shows one continuous block instead of visually split sections.
  const fullSystemPromptText =
    interpolatedSystemPrompt + (modalityAppendix ?? "") + (multimodalDirectives ?? "");

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
                <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground italic">
                  {fullSystemPromptText}
                </pre>
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
            {endingDirectiveText ? (
              <PreviewBlock text={endingDirectiveText} />
            ) : endingInstruction ? (
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

        <TabsContent value="evaluation" className="space-y-4">
          {evaluationSystemMessage !== null && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Evaluation System Message
              </Label>
              <PreviewBlock text={evaluationSystemMessage} />
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {evaluationSystemMessage !== null
                ? "Evaluation User Message"
                : "Evaluation Prompt"}
            </Label>
            {evaluationUserMessage !== null ? (
              <PreviewBlock text={evaluationUserMessage} />
            ) : evaluationPrompt ? (
              <PreviewBlock text={interpolatedEvaluation} />
            ) : (
              <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
                Using the default evaluation prompt.
              </p>
            )}
          </div>
        </TabsContent>

        {showDynamicGenerationPrompt && (
          <TabsContent value="generation" className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Question Generation System Message
              </Label>
              <PreviewBlock text={generationSystemMessage} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Question Generation User Message
              </Label>
              <PreviewBlock text={generationUserMessage} />
            </div>
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
