/**
 * UI-only types for the activity-template editor mockup (no DB wiring).
 *
 * Mirrors the serialized `ActivityTypeDefinition` shape from the plan
 * (dev-docs/activity-templates-plan.md, Appendix A) — directives are data
 * fields (`actionGuidance`, `endConditionInstruction`) and the action↔type
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
export type Visibility = "private" | "public";
export type TemplateStatus = "active" | "archived";

export interface TemplateDefinition {
  // Conversation prompt
  /** The system prompt — who the AI is and what it should do. */
  systemPrompt: string;
  conversationStart: {
    first_question: string;
    subsequent_questions: string;
  };
  /**
   * Per-action pedagogy fragments — how/when to use each enabled action in
   * context, keyed by action kind. Only the enabled actions' fragments are
   * shown in the editor and composed into the live prompt.
   */
  actionGuidance: Partial<Record<ActionKind, string>>;
  /**
   * Overrides the default "language support available" directive (e.g.
   * speaking practice stays in character and continues the role-play in the
   * support language instead of translating). Blank = use the system default.
   */
  languageSupportDirective: string;
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
