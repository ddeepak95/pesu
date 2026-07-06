/**
 * Seed data for the template-editor mockup, derived from the live activity-type
 * registry so the gallery shows the real 4 system templates. No DB — this is an
 * in-memory starting point the editor mutates locally.
 */

import {
  getActivityTypeGenerationCopy,
  listActivityTypes,
} from "@/lib/activityTypes/registry";
import { DEFAULT_ACTIVITY_TYPE_LABELS } from "@/lib/activityTypes/types";
import type { ActivityTypeDefinition } from "@/lib/activityTypes/types";
import { COMMON_DEFAULT_FEEDBACK_FOCUS_AREAS } from "@/lib/feedbackFocus";
import { listImplementedActions } from "@/lib/multimodal/actions/registry";
import type { ActionKind } from "@/lib/multimodal/actions/types";

import type { MockTemplate, TemplateDefinition } from "./types";

/** Blank-filled `actionGuidance` for every implemented action kind. */
function emptyActionGuidance(): Partial<Record<ActionKind, string>> {
  return Object.fromEntries(
    listImplementedActions().map((action) => [action.kind, ""]),
  ) as Partial<Record<ActionKind, string>>;
}

const DESCRIPTIONS: Record<string, string> = {
  learning:
    "A friendly tutor that guides a student through a topic with explanations and questions.",
  assessment:
    "A neutral examiner that assesses a student against a rubric without teaching.",
  speaking_practice:
    "A role-play conversation partner for practising speaking through a realistic scenario.",
  code_review:
    "A reviewer that walks through a student's code on screen and discusses it.",
};

const PER_TYPE_BULB: Record<string, TemplateDefinition["bulbAction"]> = {
  speaking_practice: "suggested_response",
};

/** Map a live registry definition into the editor's serializable mock shape. */
function toMockDefinition(def: ActivityTypeDefinition): TemplateDefinition {
  return {
    systemPrompt: def.systemPrompt,
    conversationStart: { ...def.conversationStart },
    actionGuidance: {
      ...emptyActionGuidance(),
      ...def.actionGuidance,
    },
    languageSupportDirective: def.languageSupportDirective ?? "",
    endConditionInstruction: def.endConditionInstruction,
    evaluationPrompt: def.evaluationPrompt,
    evaluationSystemPersona: def.evaluationSystemPersona,
    labels: { ...DEFAULT_ACTIVITY_TYPE_LABELS, ...def.labels },
    defaultFeedbackFocusAreas: (
      def.defaultFeedbackFocusAreas ?? COMMON_DEFAULT_FEEDBACK_FOCUS_AREAS
    ).map((a) => ({ ...a })),
    defaults: {
      interactionType: def.defaults?.interactionType ?? "multimodal",
      display: { useStarDisplay: def.defaults?.display?.useStarDisplay ?? false },
      fileSubmission: {
        required: def.defaults?.fileSubmission?.required ?? false,
      },
      multimodal: {
        languageSupportEnabled:
          def.defaults?.multimodal?.languageSupportEnabled ?? false,
        availableActions: def.defaults?.multimodal?.availableActions ?? [],
        interactionConfig: {
          input: {
            audioDelivery:
              def.defaults?.multimodal?.interactionConfig?.input?.audioDelivery ??
              "transcribe",
          },
          output: {},
        },
      },
    },
    bulbAction: PER_TYPE_BULB[def.kind] ?? "none",
    generation: {
      // rubricCoverage/expectedAnswerCoverage always resolve to real copy —
      // the generator falls back to generic wording when a type omits them.
      rubricCoverage: getActivityTypeGenerationCopy(def.kind).rubricCoverage,
      expectedAnswerCoverage:
        getActivityTypeGenerationCopy(def.kind).expectedAnswerCoverage,
      // guidance/dynamicGenerationGuidance have no generic fallback — "" is
      // the real runtime value when a type doesn't set them.
      guidance: def.generation?.guidance ?? "",
      dynamicGenerationGuidance: def.generation?.dynamicGenerationGuidance ?? "",
    },
  };
}

/**
 * Deep-clones a seed template's definition for use as new-template starter
 * content, so a fresh template opens with real, editable copy instead of a
 * blank slate.
 */
export function cloneSeedDefinition(kind: string = "learning"): TemplateDefinition {
  const seed = buildSeedTemplates().find((t) => t.id === kind);
  const definition = seed?.definition ?? buildSeedTemplates()[0]?.definition;
  if (!definition) return emptyDefinition();
  return {
    ...definition,
    conversationStart: { ...definition.conversationStart },
    actionGuidance: { ...definition.actionGuidance },
    labels: { ...definition.labels },
    defaultFeedbackFocusAreas: definition.defaultFeedbackFocusAreas.map((a) => ({
      ...a,
    })),
    defaults: {
      ...definition.defaults,
      display: { ...definition.defaults.display },
      fileSubmission: { ...definition.defaults.fileSubmission },
      multimodal: {
        ...definition.defaults.multimodal,
        availableActions: [...definition.defaults.multimodal.availableActions],
        interactionConfig: {
          input: { ...definition.defaults.multimodal.interactionConfig.input },
          output: { ...definition.defaults.multimodal.interactionConfig.output },
        },
      },
    },
    generation: { ...definition.generation },
  };
}

export function buildSeedTemplates(): MockTemplate[] {
  return listActivityTypes().map((def) => ({
    id: def.kind,
    name: def.label,
    description: DESCRIPTIONS[def.kind] ?? "",
    ownerScope: "system" as const,
    visibility: "public" as const,
    status: "active" as const,
    definition: toMockDefinition(def),
    updatedAt: "2026-06-20T00:00:00.000Z",
  }));
}

/** A blank template definition for the "New template" flow. */
export function emptyDefinition(): TemplateDefinition {
  return {
    systemPrompt: "",
    conversationStart: { first_question: "", subsequent_questions: "" },
    actionGuidance: emptyActionGuidance(),
    languageSupportDirective: "",
    endConditionInstruction: "",
    evaluationPrompt: "",
    evaluationSystemPersona: "",
    labels: { ...DEFAULT_ACTIVITY_TYPE_LABELS },
    defaultFeedbackFocusAreas: [],
    defaults: {
      interactionType: "multimodal",
      display: { useStarDisplay: false },
      fileSubmission: { required: false },
      multimodal: {
        languageSupportEnabled: false,
        availableActions: [],
        interactionConfig: {
          input: { audioDelivery: "transcribe" },
          output: {},
        },
      },
    },
    bulbAction: "none",
    generation: {
      rubricCoverage: "",
      expectedAnswerCoverage: "",
      guidance: "",
      dynamicGenerationGuidance: "",
    },
  };
}
