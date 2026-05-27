export type ChatPhase =
  | "not_started"
  | "bot_thinking"
  | "bot_speaking"
  | "user_idle"
  | "user_recording"
  | "user_submitting";

export type KonvoUiState =
  | "bot_thinking"
  | "bot_speaking"
  | "user_listening"
  | "user_speaking";

export type WaveMode = "thinking" | "audio" | "none";

export interface KonvoUiConfig {
  uiState: KonvoUiState;
  botExpanded: boolean;
  userExpanded: boolean;
  showBotWave: boolean;
  showUserWave: boolean;
  botWaveMode: WaveMode;
  userWaveMode: WaveMode;
  actionButton: "mic" | "send";
  micEnabled: boolean;
  showUserSpeakPrompt: boolean;
}

export function getKonvoUiState(
  phase: ChatPhase,
  isTranscribing: boolean,
): KonvoUiState {
  if (
    phase === "bot_thinking" ||
    phase === "user_submitting" ||
    (phase === "user_recording" && isTranscribing)
  ) {
    return "bot_thinking";
  }
  if (phase === "bot_speaking") return "bot_speaking";
  if (phase === "user_idle") return "user_listening";
  if (phase === "user_recording") return "user_speaking";
  return "bot_thinking";
}

export function getKonvoUiConfig(
  phase: ChatPhase,
  isTranscribing: boolean,
): KonvoUiConfig {
  const uiState = getKonvoUiState(phase, isTranscribing);

  switch (uiState) {
    case "bot_thinking":
      return {
        uiState,
        botExpanded: true,
        userExpanded: false,
        showBotWave: true,
        showUserWave: false,
        botWaveMode: "thinking",
        userWaveMode: "none",
        actionButton: "mic",
        micEnabled: false,
        showUserSpeakPrompt: false,
      };
    case "bot_speaking":
      return {
        uiState,
        botExpanded: true,
        userExpanded: false,
        showBotWave: true,
        showUserWave: false,
        botWaveMode: "audio",
        userWaveMode: "none",
        actionButton: "mic",
        micEnabled: true,
        showUserSpeakPrompt: false,
      };
    case "user_listening":
      return {
        uiState,
        botExpanded: false,
        userExpanded: true,
        showBotWave: false,
        showUserWave: false,
        botWaveMode: "none",
        userWaveMode: "none",
        actionButton: "mic",
        micEnabled: true,
        showUserSpeakPrompt: true,
      };
    case "user_speaking":
      return {
        uiState,
        botExpanded: false,
        userExpanded: true,
        showBotWave: false,
        showUserWave: true,
        botWaveMode: "none",
        userWaveMode: "audio",
        actionButton: "send",
        micEnabled: false,
        showUserSpeakPrompt: false,
      };
  }
}

export type BotVisualState =
  | "thinking"
  | "speaking"
  | "listening"
  | "ready";

export function uiStateToBotVisual(uiState: KonvoUiState): BotVisualState {
  if (uiState === "bot_thinking") return "thinking";
  if (uiState === "bot_speaking") return "speaking";
  if (uiState === "user_listening") return "ready";
  return "listening";
}

/** Matches main UI Card: focused = default card surface, unfocused = muted. */
export function getKonvoPanelCardClass(focused: boolean): string {
  return focused
    ? "bg-card shadow-[var(--card-shadow)] transition-[background-color,box-shadow] duration-300 ease-out"
    : "bg-muted/60 border-border/60 transition-[background-color,box-shadow,border-color] duration-300 ease-out";
}
