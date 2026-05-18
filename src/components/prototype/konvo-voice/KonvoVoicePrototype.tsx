"use client";

import { ContentBox } from "./ContentBox";
import { BotStatusPanel } from "./BotStatusPanel";
import { UserInputPanel } from "./UserInputPanel";
import { useTurnBasedVoiceChat } from "./useTurnBasedVoiceChat";

export function KonvoVoicePrototype() {
  const chat = useTurnBasedVoiceChat();

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-5xl mx-auto p-4 gap-4">
      <header className="shrink-0">
        <h1 className="text-xl font-semibold text-foreground">Konvo Voice Prototype</h1>
        <p className="text-sm text-muted-foreground">
          Turn-based voice chat — local prototype
        </p>
      </header>

      {chat.error ? (
        <div
          role="alert"
          className="shrink-0 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {chat.error}
        </div>
      ) : null}

      <ContentBox content={chat.content} />

      <div className="grid grid-cols-1 md:grid-cols-[1fr_minmax(200px,280px)] gap-4 shrink-0 min-h-[160px]">
        <BotStatusPanel phase={chat.phase} />
        <UserInputPanel
          phase={chat.phase}
          disabled={chat.userPanelDisabled}
          canSend={chat.canSend}
          isTranscribing={chat.isTranscribing}
          recorder={chat.recorder}
          onTapToSpeak={chat.handleTapToSpeak}
          onSend={() => void chat.handleSend()}
        />
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
  );
}

