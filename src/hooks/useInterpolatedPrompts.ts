import { useMemo, useCallback } from "react";
import { Question, BotPromptConfig } from "@/types/assignment";
import {
  interpolatePromptsForRuntime,
  interpolatePrompt,
  buildRuntimeContext,
  getLanguageName,
} from "@/lib/promptInterpolation";
import {
  buildDefaultBotPromptConfig,
  CHAT_SYSTEM_APPENDIX,
  VOICE_SYSTEM_APPENDIX,
  type ActivityType,
  type InteractionType,
} from "@/lib/promptTemplates";

interface UseInterpolatedPromptsArgs {
  question: Question;
  language: string;
  attemptCount: number;
  botPromptConfig?: BotPromptConfig;
  maxAttempts?: number;
  sharedContext?: string;
  evaluationPromptTemplate?: string;
  fileSubmissionsContent?: string;
  assessmentMode?: InteractionType;
  activityType?: ActivityType;
  /**
   * Learner's support language (locale code). Used as the evaluation feedback
   * language for activity types that request it (e.g. Speaking Practice).
   */
  supportLanguage?: string;
  title?: string;
  studentInstructions?: string;
  totalQuestions?: number;
}

interface InterpolatedPrompts {
  systemPrompt: string;
  greeting: string;
  /** Build the interpolated evaluation prompt. Takes answerText since it's only known at eval time. */
  buildEvaluationPrompt: (answerText: string) => string | undefined;
}

/**
 * Consolidates prompt interpolation for ChatInputArea, VoiceInputArea, and
 * AssessmentShell evaluation into a single hook. All results are memoized so
 * they recompute only when question/language/attempt/config change — not on
 * every message send or re-render.
 *
 * Always returns a non-null systemPrompt and greeting (falls back to defaults).
 * For text_chat mode, appends CHAT_SYSTEM_APPENDIX transparently.
 */
export function useInterpolatedPrompts({
  question,
  language,
  attemptCount,
  botPromptConfig,
  maxAttempts,
  sharedContext,
  evaluationPromptTemplate,
  fileSubmissionsContent,
  assessmentMode = "voice",
  activityType = "learning",
  supportLanguage,
  title,
  studentInstructions,
  totalQuestions,
}: UseInterpolatedPromptsArgs): InterpolatedPrompts {
  const effectiveConfig = useMemo(
    () => botPromptConfig ?? buildDefaultBotPromptConfig(activityType, assessmentMode),
    [botPromptConfig, activityType, assessmentMode],
  );

  const assignmentShim = useMemo(
    () => ({
      title: title || "",
      student_instructions: studentInstructions || "",
      questions: Array.from({ length: totalQuestions ?? 1 }) as Question[],
      max_attempts: maxAttempts || 1,
      bot_prompt_config: effectiveConfig,
      shared_context: sharedContext,
    }),
    [title, studentInstructions, totalQuestions, maxAttempts, effectiveConfig, sharedContext],
  );

  const attemptNumber = attemptCount + 1;

  const languageName = useMemo(() => getLanguageName(language), [language]);

  const { systemPrompt, greeting } = useMemo(() => {
    const result = interpolatePromptsForRuntime(
      assignmentShim as Parameters<typeof interpolatePromptsForRuntime>[0],
      question,
      language,
      attemptNumber,
      fileSubmissionsContent,
      supportLanguage,
    );

    let sp = result?.system_prompt ?? "";
    const gr = result?.greeting ?? "";

    if (assessmentMode === "text_chat") {
      sp += CHAT_SYSTEM_APPENDIX.replace(/\{\{language\}\}/g, languageName);
    } else if (assessmentMode === "voice") {
      sp += VOICE_SYSTEM_APPENDIX;
    }

    return { systemPrompt: sp, greeting: gr };
  }, [
    assignmentShim,
    question,
    language,
    attemptNumber,
    fileSubmissionsContent,
    assessmentMode,
    languageName,
    supportLanguage,
  ]);

  const buildEvaluationPrompt = useCallback(
    (answerText: string): string | undefined => {
      if (!evaluationPromptTemplate) return undefined;

      const evalContext = buildRuntimeContext(
        assignmentShim as Parameters<typeof buildRuntimeContext>[0],
        question,
        language,
        attemptNumber,
        question.order,
        answerText,
        fileSubmissionsContent,
        supportLanguage,
      );
      return interpolatePrompt(evaluationPromptTemplate, evalContext);
    },
    [
      assignmentShim,
      evaluationPromptTemplate,
      question,
      language,
      attemptNumber,
      fileSubmissionsContent,
      supportLanguage,
    ],
  );

  return { systemPrompt, greeting, buildEvaluationPrompt };
}
