"use client";

import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ContentBox } from "./ContentBox";
import { BotStatusPanel } from "./BotStatusPanel";
import { UserInputPanel } from "./UserInputPanel";
import { useTurnBasedVoiceChat } from "./useTurnBasedVoiceChat";

export function KonvoVoicePrototype() {
  const chat = useTurnBasedVoiceChat();
  const { ui } = chat;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-5xl mx-auto p-4 gap-4">
      <header className="shrink-0">
        <h1 className="text-xl font-semibold text-foreground">Konvo Voice Prototype</h1>
        <p className="text-sm text-muted-foreground">
          Turn-based voice chat — local prototype
        </p>
      </header>

      {!chat.isStarted ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 p-8">
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Start a turn-based voice session with Konvo. The bot will greet you
            first; then you can record and send replies.
          </p>
          <Button
            type="button"
            size="lg"
            className="gap-2"
            onClick={chat.handleStart}
          >
            <Play className="h-5 w-5" />
            Start
          </Button>
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
