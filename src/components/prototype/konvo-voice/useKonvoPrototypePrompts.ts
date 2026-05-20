"use client";

import { useMemo } from "react";
import { useInterpolatedPrompts } from "@/hooks/useInterpolatedPrompts";
import {
  KONVO_DEMO_ASSIGNMENT,
  KONVO_DEMO_QUESTION,
} from "@/lib/prototype/konvo-voice/promptFixture";
import { KONVO_STRUCTURED_OUTPUT_APPENDIX } from "@/lib/prototype/konvo-voice/promptAppendix";
import type { ActivityType } from "@/lib/promptTemplates";
import { getLanguageName } from "@/lib/promptInterpolation";

export function useKonvoPrototypePrompts(
  language: string,
  activityType: ActivityType,
) {
  const { systemPrompt, greeting } = useInterpolatedPrompts({
    question: KONVO_DEMO_QUESTION,
    language,
    attemptCount: 0,
    assessmentMode: "voice",
    activityType,
    title: KONVO_DEMO_ASSIGNMENT.title,
    studentInstructions: KONVO_DEMO_ASSIGNMENT.student_instructions,
    maxAttempts: KONVO_DEMO_ASSIGNMENT.max_attempts,
    sharedContext: KONVO_DEMO_ASSIGNMENT.shared_context,
    totalQuestions: 1,
  });

  const languageName = useMemo(() => getLanguageName(language), [language]);

  const fullSystemPrompt = useMemo(() => {
    const appendix = KONVO_STRUCTURED_OUTPUT_APPENDIX.replace(
      /\{\{language\}\}/g,
      languageName,
    );
    return `${systemPrompt}${appendix}`;
  }, [systemPrompt, languageName]);

  return { systemPrompt: fullSystemPrompt, greeting };
}
