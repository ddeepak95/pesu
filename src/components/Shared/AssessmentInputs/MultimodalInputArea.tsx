"use client";

import { useEffect, useMemo, useState } from "react";
import { Play } from "lucide-react";
import { useInterpolatedPrompts } from "@/hooks/useInterpolatedPrompts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContentBox } from "@/components/prototype/konvo-voice/ContentBox";
import { BotStatusPanel } from "@/components/prototype/konvo-voice/BotStatusPanel";
import { UserInputPanel } from "@/components/prototype/konvo-voice/UserInputPanel";
import { DEFAULT_KONVO_SESSION_CONFIG } from "@/components/prototype/konvo-voice/defaultSessionConfig";
import { useTurnBasedVoiceChat } from "@/components/prototype/konvo-voice/useTurnBasedVoiceChat";
import { APP_ASSESSMENT_SHELL_CLASS } from "@/components/prototype/konvo-voice/layoutConstants";
import { KONVO_STRUCTURED_OUTPUT_APPENDIX } from "@/lib/prototype/konvo-voice/promptAppendix";
import { getLanguageName } from "@/lib/promptInterpolation";
import { cn } from "@/lib/utils";
import type { AssessmentInputProps } from "./types";

export function MultimodalInputArea({
  question,
  language,
  maxAttemptsReached,
  isEvaluating,
  onSubmitForEvaluation,
  onNavigationDisabledChange,
  fileSubmissionsContent,
  activityType = "learning",
  title,
  studentInstructions,
  maxAttempts,
  attempts,
  sharedContext,
  botPromptConfig,
}: AssessmentInputProps) {
  const [finalAnswer, setFinalAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { systemPrompt, greeting } = useInterpolatedPrompts({
    question,
    language,
    attemptCount: attempts.length,
    assessmentMode: "voice",
    activityType,
    title,
    studentInstructions,
    maxAttempts,
    sharedContext,
    botPromptConfig,
    fileSubmissionsContent,
    totalQuestions: 1,
  });

  const languageName = useMemo(() => getLanguageName(language), [language]);
  const multimodalPrompt = useMemo(
    () =>
      `${systemPrompt}${KONVO_STRUCTURED_OUTPUT_APPENDIX.replace(/\{\{language\}\}/g, languageName)}`,
    [systemPrompt, languageName],
  );

  const chat = useTurnBasedVoiceChat({
    sessionConfig: {
      ...DEFAULT_KONVO_SESSION_CONFIG,
      language,
      activityType,
    },
    systemPrompt: multimodalPrompt,
    greeting,
  });

  const latestUserMessage = useMemo(() => {
    for (let i = chat.messages.length - 1; i >= 0; i -= 1) {
      const m = chat.messages[i];
      if (m.role === "user" && m.content.trim()) return m.content.trim();
    }
    return "";
  }, [chat.messages]);

  useEffect(() => {
    const disableNavigation =
      chat.phase === "user_recording" ||
      chat.phase === "user_submitting" ||
      chat.phase === "bot_thinking" ||
      chat.phase === "bot_speaking" ||
      isSubmitting ||
      isEvaluating;
    onNavigationDisabledChange?.(disableNavigation);
    return () => onNavigationDisabledChange?.(false);
  }, [
    chat.phase,
    isSubmitting,
    isEvaluating,
    onNavigationDisabledChange,
  ]);

  async function handleSubmitFinalAnswer() {
    if (!finalAnswer.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmitForEvaluation(finalAnswer.trim());
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {!chat.isStarted ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 p-6">
          <p className="text-sm text-muted-foreground text-center">
            Start multimodal interaction to explore this question.
          </p>
          <Button type="button" className="gap-2" onClick={chat.handleStart}>
            <Play className="h-4 w-4" />
            Start Multimodal
          </Button>
        </div>
      ) : (
        <div className={cn(APP_ASSESSMENT_SHELL_CLASS, "min-h-[420px] flex flex-col")}>
          {chat.error ? (
            <div
              role="alert"
              className="shrink-0 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive"
            >
              {chat.error}
            </div>
          ) : null}

          <ContentBox content={chat.content} />
          <div className="flex flex-col md:flex-row gap-4 shrink-0 min-h-[150px]">
            <div
              className={cn(
                "min-w-0 transition-[flex] duration-300 ease-out",
                chat.ui.botExpanded ? "flex-[2]" : "flex-1",
              )}
            >
              <BotStatusPanel
                uiState={chat.ui.uiState}
                focused={chat.ui.botExpanded}
                showBotWave={chat.ui.showBotWave}
                botWaveMode={chat.ui.botWaveMode}
                playbackAnalyser={chat.playbackAnalyser}
              />
            </div>
            <div
              className={cn(
                "min-w-0 transition-[flex] duration-300 ease-out",
                chat.ui.userExpanded ? "flex-[2]" : "flex-1",
              )}
            >
              <UserInputPanel
                ui={chat.ui}
                canSend={chat.canSend}
                recorder={chat.recorder}
                onMicPress={() => void chat.handleMicPress()}
                onSend={() => void chat.handleSend()}
              />
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Final answer for evaluation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={finalAnswer}
            onChange={(e) => setFinalAnswer(e.target.value)}
            placeholder="Write your final response here before submitting."
            rows={5}
            disabled={maxAttemptsReached || isEvaluating || isSubmitting}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setFinalAnswer(latestUserMessage)}
              disabled={!latestUserMessage || maxAttemptsReached || isEvaluating || isSubmitting}
            >
              Use latest transcript
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmitFinalAnswer()}
              disabled={
                !finalAnswer.trim() ||
                maxAttemptsReached ||
                isEvaluating ||
                isSubmitting
              }
            >
              {isSubmitting || isEvaluating ? "Submitting..." : "Submit for Evaluation"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
