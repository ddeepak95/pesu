import type { ActionKind, ActionPayload } from "@/lib/multimodal/actions/types";

/**
 * Client-side view of an action attached to an assistant message.
 * `loading` while the content agent generates, `ready` once the payload
 * arrives, `error` if generation failed (then dropped from the message).
 */
export interface PendingAction {
  id: string;
  kind: ActionKind;
  state: "loading" | "ready" | "error";
  payload?: ActionPayload;
  /** MCQ: index the learner selected; locks the card once set. */
  answeredIndex?: number;
}
