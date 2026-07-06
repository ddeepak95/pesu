/**
 * Shared (server + client) configuration for how a multimodal turn behaves.
 * Pure types only — no server-only imports.
 */

import type { ActionKind } from "./actions/types";

export interface EndConversationConfig {
  /**
   * Optional extra guidance for when to wrap up, appended to the built-in
   * default (which always ends on thorough completion or learner refusal),
   * e.g. "wrap up once the student demonstrates understanding".
   */
  customInstruction?: string;
}

export interface LanguageSupportConfig {
  /** Whether the learner can request explanations in a support language. */
  enabled?: boolean;
  /**
   * Teacher's default support language (locale code, e.g. "hi"). Used as the
   * initial selection on the learner side.
   */
  defaultLanguage?: string;
  /** When true, the learner cannot change the support language. */
  locked?: boolean;
}

export interface MultimodalActionsConfig {
  /** Action kinds the teacher enabled for this activity. */
  availableActions?: ActionKind[];
  endConversation?: EndConversationConfig;
  languageSupport?: LanguageSupportConfig;
}

/**
 * How the learner and tutor exchange audio for this activity — separate from
 * MultimodalActionsConfig, which governs mid-conversation capabilities (MCQ,
 * language support). See dev-docs/multimodal-interaction-config-plan.md.
 */
export interface MultimodalInteractionConfig {
  input?: {
    /** Learner-facing input methods. Only "audio" is implemented today. */
    modes?: ("text" | "audio")[];
    /**
     * "direct" sends the learner's raw audio straight to the chat model
     * (bypassing STT) when the class's bound model supports it. Defaults to
     * "transcribe" (today's only behavior) when unset.
     */
    audioDelivery?: "transcribe" | "direct";
  };
  output?: {
    /**
     * Reserved — not implemented yet (Phase 2 of the plan doc). Governs
     * whether/when the tutor's reply is synthesized to speech.
     */
    speechMode?: "automatic" | "on_demand" | "none";
    /** Reserved — not implemented (see plan doc §5). */
    audioSource?: "tts_provider" | "model_native";
  };
}

/**
 * Why the model needs to resolve a canonical `userTranscript` this turn:
 * - `dual_stt`: the learner's audio was transcribed twice (two language
 *   hints); the model must pick the coherent reading, verbatim.
 * - `direct_audio`: the learner's raw audio was sent inline (no STT ran at
 *   all); the model must transcribe what it heard itself.
 * Shared by chat-stream-object.ts (schema) and multimodal-directives.ts
 * (system-prompt wording) — kept here so neither imports from the other.
 * See dev-docs/multimodal-interaction-config-plan.md §3c.
 */
export type TranscriptResolutionMode =
  | { kind: "dual_stt"; primaryLabel: string; supportLabel: string }
  | { kind: "direct_audio" };

/** A single inline audio part attached to the latest user message (direct-audio-input mode). */
export interface MultimodalAudioPart {
  type: "file";
  data: string;
  mediaType: string;
}

export type MultimodalMessageContent = string | MultimodalAudioPart[];

export interface MultimodalSdkMessage {
  role: "user" | "assistant";
  content: MultimodalMessageContent;
}

/**
 * Client-side pre-flight cap on direct-audio-input recordings (§7.2 of the
 * plan doc). Gemini's inline (non-Files-API) requests cap at 20 MB total
 * request size; base64 adds ~33% overhead, so this budgets raw WAV bytes
 * conservatively under that, leaving headroom for the rest of the JSON body.
 * In practice this should almost never trigger — even at a conservative
 * 44.1kHz/16-bit/mono estimate it works out to roughly 2.5-3 minutes of
 * audio, well beyond a single mic-button utterance.
 */
export const DIRECT_AUDIO_INPUT_MAX_BYTES = 15 * 1024 * 1024;
