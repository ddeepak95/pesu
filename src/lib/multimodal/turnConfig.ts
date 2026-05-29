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

export interface MultimodalActionsConfig {
  /** Action kinds the teacher enabled for this activity. */
  availableActions?: ActionKind[];
  endConversation?: EndConversationConfig;
}
