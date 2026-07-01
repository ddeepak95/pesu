/**
 * UI-only types for the activity-template editor mockup (no DB wiring).
 *
 * Mirrors the serialized `ActivityTypeDefinition` shape from the plan
 * (dev-docs/activity-templates-plan.md, Appendix A) — directives are data
 * fields (`multimodalDirective`, `endConditionInstruction`) and the action↔type
 * coupling is inverted onto the template (`bulbAction`). Used only to
 * demonstrate the editor surface; nothing here is persisted.
 */

import type { ActionKind } from "@/lib/multimodal/actions/types";
import type {
  ActivityInteractionType,
  ActivityTypeLabels,
} from "@/lib/activityTypes/types";
import type { FeedbackFocusArea } from "@/lib/feedbackFocus";

export type OwnerScope = "user" | "class" | "institution" | "system";
export type Visibility = "private" | "institution" | "public";
export type TemplateStatus = "active" | "archived";

export interface TemplateDefinition {
  // Conversation prompt
  /** The system prompt — who the AI is and what it should do. */
  systemPrompt: string;
  conversationStart: {
    first_question: string;
    subsequent_questions: string;
  };
  /** Extra system-prompt text appended only in multimodal mode. */
  multimodalDirective: string;
  /** When the model should end the conversation (drives the endConversation field). */
  endConditionInstruction: string;

  // Evaluation
  evaluationPrompt: string;
  evaluationSystemPersona: string;

  // Question Card labels (full set, not partial — the editor edits every field)
  labels: ActivityTypeLabels;

  // Feedback focus defaults
  defaultFeedbackFocusAreas: FeedbackFocusArea[];

  // Defaults & presets
  defaults: {
    interactionType: ActivityInteractionType;
    display: { useStarDisplay: boolean };
    fileSubmission: { required: boolean };
    multimodal: {
      languageSupportEnabled: boolean;
      availableActions: ActionKind[];
    };
  };

  // Actions wiring
  bulbAction: ActionKind | "none";

  // Generation copy
  generation: {
    rubricCoverage: string;
    expectedAnswerCoverage: string;
    guidance: string;
    dynamicGenerationGuidance: string;
  };
}

export interface MockTemplate {
  id: string;
  name: string;
  description: string;
  ownerScope: OwnerScope;
  visibility: Visibility;
  status: TemplateStatus;
  definition: TemplateDefinition;
  updatedAt: string;
}
