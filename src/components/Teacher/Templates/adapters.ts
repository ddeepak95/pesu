/**
 * Adapters between the persisted template shape and the (fully-required) editor
 * shape — Phase 2 of dev-docs/activity-templates-plan.md.
 *
 * The template editor (`Platform/Templates/TemplateEditor`) was built against a
 * mockup `TemplateDefinition` where every field is present. The persisted
 * `TemplateDefinition` (src/lib/activityTypes/templates.ts) makes directives,
 * defaults, generation, and the action wiring optional. These pure adapters
 * bridge the two so the one editor can drive the personal/class libraries:
 *   - `toEditorDefinition` fills optional fields with defaults for editing,
 *   - `fromEditorDefinition` maps back for persistence, preserving `autoActions`
 *     (which the editor doesn't expose) from the original definition.
 */

import type { ActionKind } from "@/lib/multimodal/actions/types";
import { listImplementedActions } from "@/lib/multimodal/actions/registry";
import type { TemplateDefinition as RealDefinition } from "@/lib/activityTypes/templates";
import { DEFAULT_ACTIVITY_TYPE_LABELS } from "@/lib/activityTypes/types";
import type {
  MockTemplate,
  TemplateDefinition as EditorDefinition,
} from "@/components/Platform/Templates/types";
import type { ActivityTemplateRow } from "@/lib/queries/activityTemplates";

export function toEditorDefinition(real: RealDefinition): EditorDefinition {
  return {
    systemPrompt: real.systemPrompt,
    conversationStart: { ...real.conversationStart },
    actionGuidance: Object.fromEntries(
      listImplementedActions().map((action) => [
        action.kind,
        real.actionGuidance?.[action.kind] ?? "",
      ]),
    ) as Partial<Record<ActionKind, string>>,
    languageSupportDirective: real.languageSupportDirective ?? "",
    endConditionInstruction: real.endConditionInstruction,
    evaluationPrompt: real.evaluationPrompt,
    evaluationSystemPersona: real.evaluationSystemPersona,
    labels: { ...DEFAULT_ACTIVITY_TYPE_LABELS, ...real.labels },
    defaultFeedbackFocusAreas: real.defaultFeedbackFocusAreas.map((a) => ({
      ...a,
    })),
    defaults: {
      interactionType: real.defaults?.interactionType ?? "multimodal",
      display: {
        useStarDisplay: real.defaults?.display?.useStarDisplay ?? false,
      },
      fileSubmission: {
        required: real.defaults?.fileSubmission?.required ?? false,
      },
      multimodal: {
        languageSupportEnabled:
          real.defaults?.multimodal?.languageSupportEnabled ?? false,
        availableActions: (real.defaults?.multimodal?.availableActions ??
          []) as ActionKind[],
        interactionConfig: {
          input: {
            modes: [
              ...(real.defaults?.multimodal?.interactionConfig?.input?.modes ?? [
                "audio",
              ]),
            ] as ("text" | "audio")[],
            audioDelivery:
              real.defaults?.multimodal?.interactionConfig?.input?.audioDelivery ??
              "transcribe",
          },
          output: {
            speechMode:
              real.defaults?.multimodal?.interactionConfig?.output?.speechMode ??
              "automatic",
          },
        },
      },
    },
    bulbAction: real.bulbAction ?? "none",
    generation: {
      rubricCoverage: real.generation?.rubricCoverage ?? "",
      expectedAnswerCoverage: real.generation?.expectedAnswerCoverage ?? "",
      guidance: real.generation?.guidance ?? "",
      dynamicGenerationGuidance: real.generation?.dynamicGenerationGuidance ?? "",
    },
  };
}

export function fromEditorDefinition(
  editor: EditorDefinition,
  original?: RealDefinition | null,
): RealDefinition {
  return {
    systemPrompt: editor.systemPrompt,
    conversationStart: { ...editor.conversationStart },
    evaluationPrompt: editor.evaluationPrompt,
    evaluationSystemPersona: editor.evaluationSystemPersona,
    labels: { ...editor.labels },
    defaultFeedbackFocusAreas: editor.defaultFeedbackFocusAreas.map((a) => ({
      ...a,
    })),
    defaults: {
      interactionType: editor.defaults.interactionType,
      display: { useStarDisplay: editor.defaults.display.useStarDisplay },
      fileSubmission: { required: editor.defaults.fileSubmission.required },
      multimodal: {
        languageSupportEnabled:
          editor.defaults.multimodal.languageSupportEnabled,
        availableActions: [...editor.defaults.multimodal.availableActions],
        interactionConfig: {
          input: {
            modes: [...editor.defaults.multimodal.interactionConfig.input.modes],
            audioDelivery:
              editor.defaults.multimodal.interactionConfig.input.audioDelivery,
          },
          output: {
            speechMode:
              editor.defaults.multimodal.interactionConfig.output.speechMode,
          },
        },
      },
    },
    generation: { ...editor.generation },
    actionGuidance: { ...editor.actionGuidance },
    languageSupportDirective: editor.languageSupportDirective,
    endConditionInstruction: editor.endConditionInstruction,
    // The editor doesn't manage `autoActions` — preserve the source's value.
    autoActions: original?.autoActions ?? [],
    bulbAction: editor.bulbAction,
  };
}

/** Build the editor's `MockTemplate` view-model from a persisted row. */
export function rowToMockTemplate(row: ActivityTemplateRow): MockTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    ownerScope: row.owner_scope,
    visibility: row.visibility,
    status: row.status,
    definition: toEditorDefinition(row.definition),
    updatedAt: row.updated_at,
  };
}
