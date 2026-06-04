/**
 * Shared multimodal action types.
 *
 * Pure types only — no server-only imports — so this module is safe to import
 * from both the API route and client components. The action infrastructure is
 * generic; Phase 1 implements only `mcq`, but the union is designed so future
 * action kinds (image, video, equation, animation) are drop-in additions.
 */

export type ActionKind = "mcq" | "image" | "video" | "equation" | "animation" | "suggested_response";

export interface McqActionPayload {
  kind: "mcq";
  question: string;
  choices: string[];
  correctIndex: number;
  explanation?: string;
}

export interface SuggestedResponseActionPayload {
  kind: "suggested_response";
  /** Sample response in the primary language, native script. */
  responseText: string;
  /** Romanized transliteration, if applicable. */
  transliteration?: string;
  /** Translation in the support language, if one is configured. */
  translation?: string;
}

// Future payloads — uncomment/extend as each kind is implemented:
// export interface ImageActionPayload { kind: "image"; url: string; altText?: string; }
// export interface VideoActionPayload { kind: "video"; url: string; title?: string; }
// export interface EquationActionPayload { kind: "equation"; latex: string; display: "inline" | "block"; }
// export interface AnimationActionPayload { kind: "animation"; animationId: string; params?: Record<string, unknown>; }

export type ActionPayload = McqActionPayload | SuggestedResponseActionPayload;
// | ImageActionPayload | VideoActionPayload | EquationActionPayload | AnimationActionPayload;

/**
 * SSE events emitted for actions, in addition to the existing speech/text events.
 * `action_start` always precedes `action_payload` for a given `id`.
 * `action_error` replaces `action_payload` on failure.
 */
export type ActionSseEvent =
  | { type: "action_start"; id: string; kind: ActionKind }
  | { type: "action_payload"; id: string; kind: ActionKind; data: ActionPayload }
  | { type: "action_error"; id: string; kind: ActionKind; error: string };
