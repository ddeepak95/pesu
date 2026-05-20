"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ContentBox } from "./ContentBox";
import { BotStatusPanel } from "./BotStatusPanel";
import { UserInputPanel } from "./UserInputPanel";
import { APP_ASSESSMENT_SHELL_CLASS } from "./layoutConstants";
import { KonvoVoiceSettings } from "./KonvoVoiceSettings";
import { DEFAULT_KONVO_SESSION_CONFIG } from "./defaultSessionConfig";
import { useKonvoPrototypePrompts } from "./useKonvoPrototypePrompts";
import { useTurnBasedVoiceChat } from "./useTurnBasedVoiceChat";
import type { KonvoSessionConfig } from "@/lib/prototype/konvo-voice/sessionConfig";

export function KonvoVoicePrototype() {
  const [sessionConfig, setSessionConfig] = useState<KonvoSessionConfig>(
    DEFAULT_KONVO_SESSION_CONFIG,
  );
  const { systemPrompt, greeting } = useKonvoPrototypePrompts(
    sessionConfig.language,
    sessionConfig.activityType,
  );
  const chat = useTurnBasedVoiceChat({
    sessionConfig,
    systemPrompt,
    greeting,
  });
  const { ui } = chat;

  const canStart =
    Boolean(sessionConfig.sttModelId) &&
    Boolean(sessionConfig.ttsModelId) &&
    Boolean(sessionConfig.llmModelId) &&
    Boolean(sessionConfig.language);

  return (
    <div className="w-full space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">
          Konvo Voice Prototype
        </h1>
        <p className="text-sm text-muted-foreground">
          Turn-based voice chat — local prototype
        </p>
      </header>

      {!chat.isStarted ? (
        <div className="flex flex-col items-center justify-center gap-6 rounded-xl border border-dashed border-border bg-muted/20 p-8 min-h-[280px]">
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Configure models and language, then start a turn-based voice session
            with Konvo.
          </p>
          <KonvoVoiceSettings
            value={sessionConfig}
            onChange={setSessionConfig}
          />
          <Button
            type="button"
            size="lg"
            className="gap-2"
            disabled={!canStart}
            onClick={chat.handleStart}
          >
            <Play className="h-5 w-5" />
            Start
          </Button>
        </div>
      ) : (
        <div className={cn(APP_ASSESSMENT_SHELL_CLASS, "min-h-[480px] flex flex-col")}>
          {chat.error ? (
            <div
              role="alert"
              className="shrink-0 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive"
            >
              {chat.error}
            </div>
          ) : null}

          <ContentBox content={chat.content} />

          <div className="flex flex-col md:flex-row gap-4 shrink-0 min-h-[160px]">
            <div
              className={cn(
                "min-w-0 transition-[flex] duration-300 ease-out",
                ui.botExpanded ? "flex-[2]" : "flex-1",
              )}
            >
              <BotStatusPanel
                uiState={ui.uiState}
                focused={ui.botExpanded}
                showBotWave={ui.showBotWave}
                botWaveMode={ui.botWaveMode}
                playbackAnalyser={chat.playbackAnalyser}
              />
            </div>
            <div
              className={cn(
                "min-w-0 transition-[flex] duration-300 ease-out",
                ui.userExpanded ? "flex-[2]" : "flex-1",
              )}
            >
              <UserInputPanel
                ui={ui}
                canSend={chat.canSend}
                recorder={chat.recorder}
                onMicPress={() => void chat.handleMicPress()}
                onSend={() => void chat.handleSend()}
              />
            </div>
          </div>

          <details className="shrink-0 text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Debug transcript
            </summary>
            <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(chat.messages, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
