"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Eye,
  Lightbulb,
  SlidersHorizontal,
  Tag,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SettingsCard } from "@/components/ui/settings-card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  MutedPrimaryTabsList,
  MutedPrimaryTabsTrigger,
} from "@/components/Teacher/Shared/MutedPrimaryTabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FeedbackFocusEditor } from "@/components/Teacher/Assignments/FeedbackFocusEditor";
import { listImplementedActions } from "@/lib/multimodal/actions/registry";
import type { ActionKind } from "@/lib/multimodal/actions/types";
import {
  ASSESSMENT_MODE_OPTIONS,
  RETIRED_ASSESSMENT_MODES,
} from "@/lib/settings/registry";

import { PromptField } from "./PromptField";
import {
  type MockTemplate,
  type TemplateDefinition,
  type Visibility,
} from "./types";

const PROMPT_VARS = [
  "{{title}}",
  "{{instructions}}",
  "{{context_for_ai}}",
  "{{language}}",
  "{{support_language}}",
  "{{question_prompt}}",
  "{{rubric}}",
  "{{expected_answer}}",
  "{{file_submissions}}",
];

const GREETING_VARS = ["{{language}}", "{{support_language}}"];
const EVAL_VARS = [...PROMPT_VARS, "{{answer_text}}"];

const GENERATION_FIELDS: {
  key: keyof TemplateDefinition["generation"];
  label: string;
  hint: string;
}[] = [
  {
    key: "rubricCoverage",
    label: "Rubric coverage",
    hint: "What the generated rubric items should collectively cover.",
  },
  {
    key: "expectedAnswerCoverage",
    label: "Expected-answer coverage",
    hint: "What the generated expected-answer field should capture.",
  },
];

const DYNAMIC_GENERATION_FIELDS: {
  key: keyof TemplateDefinition["generation"];
  label: string;
  hint: string;
}[] = [
  {
    key: "dynamicGenerationGuidance",
    label: "Dynamic-question guidance",
    hint: "Extra rules for the dynamic question-generation endpoint.",
  },
];

function SectionHeading({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
    </div>
  );
}

const PRIMARY_LABEL_FIELDS: {
  key: "question" | "rubric" | "expectedAnswer";
  label: string;
}[] = [
  { key: "question", label: "Prompt field label" },
  { key: "rubric", label: "Rubric label" },
  { key: "expectedAnswer", label: "Expected-answer label" },
];

type AdvancedLabelKey =
  | "questionPlaceholder"
  | "rubricItemPlaceholder"
  | "rubricItemNoun"
  | "expectedAnswerPlaceholder"
  | "expectedAnswerHelp"
  | "questionNoun";

const ADVANCED_LABEL_FIELDS: { key: AdvancedLabelKey; label: string }[] = [
  { key: "questionPlaceholder", label: "Prompt placeholder" },
  { key: "rubricItemPlaceholder", label: "Rubric item placeholder" },
  { key: "rubricItemNoun", label: "Rubric item noun" },
  { key: "expectedAnswerPlaceholder", label: "Expected-answer placeholder" },
  { key: "expectedAnswerHelp", label: "Expected-answer help text" },
  {
    key: "questionNoun",
    label: 'Concept noun (validation copy) — e.g. "question", "scenario"',
  },
];

/** Sensible defaults for the advanced label fields, derived from the 3 primary labels. */
function deriveAdvancedLabels(
  primary: Pick<TemplateDefinition["labels"], "question" | "rubric" | "expectedAnswer">,
): Record<AdvancedLabelKey, string> {
  const questionLower = primary.question.toLowerCase() || "question";
  const expectedAnswerLower =
    primary.expectedAnswer.toLowerCase() || "expected answer";
  return {
    questionNoun: questionLower,
    questionPlaceholder: `Enter the ${questionLower} text`,
    rubricItemNoun: `${primary.rubric} Item`,
    rubricItemPlaceholder: `${primary.rubric} item description`,
    expectedAnswerPlaceholder: `Enter details about what the ${expectedAnswerLower} should cover (optional)`,
    expectedAnswerHelp: `Key points the ${expectedAnswerLower} should cover. Guides AI evaluation; not shown to learners.`,
  };
}

interface TemplateEditorProps {
  template: MockTemplate;
  isNew: boolean;
  onSave: (next: MockTemplate) => void;
  onCancel: () => void;
}

export function TemplateEditor({
  template,
  isNew,
  onSave,
  onCancel,
}: TemplateEditorProps) {
  const [draft, setDraft] = useState<MockTemplate>(template);
  // Tracks which advanced label fields the admin has manually overridden, so
  // editing a primary label re-derives only the ones still on auto.
  const [advancedTouched, setAdvancedTouched] = useState<
    Record<AdvancedLabelKey, boolean>
  >({
    questionPlaceholder: false,
    rubricItemPlaceholder: false,
    rubricItemNoun: false,
    expectedAnswerPlaceholder: false,
    expectedAnswerHelp: false,
    questionNoun: false,
  });

  const patch = (next: Partial<MockTemplate>) =>
    setDraft((d) => ({ ...d, ...next }));
  const patchDef = (next: Partial<TemplateDefinition>) =>
    setDraft((d) => ({ ...d, definition: { ...d.definition, ...next } }));
  const patchGeneration = (
    key: keyof TemplateDefinition["generation"],
    value: string,
  ) =>
    patchDef({
      generation: { ...draft.definition.generation, [key]: value },
    });

  const def = draft.definition;

  const toggleAction = (kind: ActionKind, on: boolean) => {
    const current = def.defaults.multimodal.availableActions;
    const nextList = on
      ? [...current, kind]
      : current.filter((k) => k !== kind);
    patchDef({
      defaults: {
        ...def.defaults,
        multimodal: {
          ...def.defaults.multimodal,
          availableActions: nextList,
        },
      },
    });
  };

  const patchPrimaryLabel = (
    key: "question" | "rubric" | "expectedAnswer",
    value: string,
  ) => {
    const nextLabels = { ...def.labels, [key]: value };
    const derived = deriveAdvancedLabels(nextLabels);
    (Object.keys(derived) as AdvancedLabelKey[]).forEach((k) => {
      if (!advancedTouched[k]) nextLabels[k] = derived[k];
    });
    patchDef({ labels: nextLabels });
  };

  const patchAdvancedLabel = (key: AdvancedLabelKey, value: string) => {
    setAdvancedTouched((t) => ({ ...t, [key]: true }));
    patchDef({ labels: { ...def.labels, [key]: value } });
  };

  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-6 pb-28">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to library
        </button>
        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          System library · super admin
        </span>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">
          {isNew ? "New system template" : `Edit · ${template.name}`}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything the author owns. Runtime scaffolding (speech / safety /
          schema rules, evaluation footer) is added by the system and is not
          shown here.
        </p>
      </div>

      {/* Identity */}
      <SettingsCard className="space-y-4">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="e.g. Speaking Practice"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea
            value={draft.description}
            onChange={(e) => patch({ description: e.target.value })}
            rows={2}
            placeholder="Short blurb shown in the gallery and dropdown."
            className="text-sm"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Visibility</Label>
            <Select
              value={draft.visibility}
              onValueChange={(v) => patch({ visibility: v as Visibility })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="institution">Institution</SelectItem>
                <SelectItem value="public">Public (community)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Owner</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
              System (read-only catalog · edited by super admins)
            </div>
          </div>
        </div>
      </SettingsCard>

      {/* Interaction settings */}
      <SettingsCard className="space-y-5">
        <SectionHeading
          icon={SlidersHorizontal}
          title="Interaction settings"
        />
        <div className="space-y-1.5">
          <Label>Interaction type</Label>
          <p className="text-xs text-muted-foreground">
            Preselected interaction mode (applied only if the class allows
            it).
          </p>
          <Select
            value={def.defaults.interactionType}
            onValueChange={(v) =>
              patchDef({
                defaults: {
                  ...def.defaults,
                  interactionType:
                    v as TemplateDefinition["defaults"]["interactionType"],
                },
              })
            }
          >
            <SelectTrigger className="sm:w-96">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSESSMENT_MODE_OPTIONS.filter(
                (opt) =>
                  !RETIRED_ASSESSMENT_MODES.has(opt.value) ||
                  opt.value === def.defaults.interactionType,
              ).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm">
            Language support enabled by default
          </span>
          <Switch
            checked={def.defaults.multimodal.languageSupportEnabled}
            onCheckedChange={(on) =>
              patchDef({
                defaults: {
                  ...def.defaults,
                  multimodal: {
                    ...def.defaults.multimodal,
                    languageSupportEnabled: on,
                  },
                },
              })
            }
          />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm">Require file submission</span>
          <Switch
            checked={def.defaults.fileSubmission.required}
            onCheckedChange={(on) =>
              patchDef({
                defaults: {
                  ...def.defaults,
                  fileSubmission: { required: on },
                },
              })
            }
          />
        </label>
      </SettingsCard>

      {/* General settings */}
      <SettingsCard className="space-y-5">
        <SectionHeading
          icon={SlidersHorizontal}
          title="General settings"
        />
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm">Show scores as stars</span>
          <Switch
            checked={def.defaults.display.useStarDisplay}
            onCheckedChange={(on) =>
              patchDef({
                defaults: {
                  ...def.defaults,
                  display: { useStarDisplay: on },
                },
              })
            }
          />
        </label>
      </SettingsCard>

      {/* Prompt configuration */}
      <SettingsCard className="space-y-4">
        <h4 className="text-sm font-semibold text-foreground">
          Prompt configuration
        </h4>
        <Tabs defaultValue="system">
          <MutedPrimaryTabsList className="mb-4 h-auto w-auto flex-wrap gap-1 rounded-md p-1">
            <MutedPrimaryTabsTrigger
              value="system"
              className="rounded-sm px-4 py-2"
            >
              System Prompt
            </MutedPrimaryTabsTrigger>
            <MutedPrimaryTabsTrigger
              value="conversation"
              className="rounded-sm px-4 py-2"
            >
              Conversation Start
            </MutedPrimaryTabsTrigger>
            <MutedPrimaryTabsTrigger
              value="ending"
              className="rounded-sm px-4 py-2"
            >
              Ending
            </MutedPrimaryTabsTrigger>
            <MutedPrimaryTabsTrigger
              value="evaluation"
              className="rounded-sm px-4 py-2"
            >
              Evaluation Prompt
            </MutedPrimaryTabsTrigger>
            <MutedPrimaryTabsTrigger
              value="generation"
              className="rounded-sm px-4 py-2"
            >
              Rubric & Answer Generator
            </MutedPrimaryTabsTrigger>
            <MutedPrimaryTabsTrigger
              value="dynamic-generation"
              className="rounded-sm px-4 py-2"
            >
              Dynamic Question Generation
            </MutedPrimaryTabsTrigger>
          </MutedPrimaryTabsList>

          <TabsContent value="system" className="space-y-5">
            <PromptField
              label="System prompt"
              hint="Who the AI is and what it should do."
              value={def.systemPrompt}
              onChange={(v) => patchDef({ systemPrompt: v })}
              rows={16}
              vars={PROMPT_VARS}
            />
            <PromptField
              label="Multimodal directive (optional)"
              hint="Extra system-prompt text applied only in multimodal mode (e.g. 'stay in character, let the student talk')."
              value={def.multimodalDirective}
              onChange={(v) => patchDef({ multimodalDirective: v })}
              rows={5}
              placeholder="Leave blank for none."
            />
          </TabsContent>

          <TabsContent value="conversation" className="space-y-5">
            <div className="space-y-1.5">
              <Label>Conversation-start greetings</Label>
              <p className="text-xs text-muted-foreground">
                What the AI opens with — spoken/shown before the student
                answers.
              </p>
            </div>
            <PromptField
              label="First-question greeting"
              value={def.conversationStart.first_question}
              onChange={(v) =>
                patchDef({
                  conversationStart: {
                    ...def.conversationStart,
                    first_question: v,
                  },
                })
              }
              rows={5}
              vars={GREETING_VARS}
            />
            <PromptField
              label="Subsequent-question greeting"
              value={def.conversationStart.subsequent_questions}
              onChange={(v) =>
                patchDef({
                  conversationStart: {
                    ...def.conversationStart,
                    subsequent_questions: v,
                  },
                })
              }
              rows={5}
              vars={GREETING_VARS}
            />
          </TabsContent>

          <TabsContent value="ending" className="space-y-5">
            <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
              <strong className="font-medium text-foreground">
                Always applied:
              </strong>{" "}
              &quot;End the conversation by setting endConversation: use
              &apos;thorough&apos; once the learner has engaged with and
              reasonably covered the topic, and &apos;refusal&apos; if the
              learner is off-topic or refuses to engage.&quot; This field only
              adds to that default — leave it blank if the default is enough.
            </div>
            <PromptField
              label="End-condition instruction (optional)"
              hint="When the model should end the conversation. Drives the runtime endConversation signal; the teacher's per-assignment wrap-up guidance layers on top."
              value={def.endConditionInstruction}
              onChange={(v) => patchDef({ endConditionInstruction: v })}
              rows={3}
              placeholder="e.g. Wrap up once the student has covered every aspect of the scenario."
            />
          </TabsContent>

          <TabsContent value="evaluation" className="space-y-5">
            <FeedbackFocusEditor
              value={def.defaultFeedbackFocusAreas}
              onChange={(v) => patchDef({ defaultFeedbackFocusAreas: v })}
            />
            <div className="space-y-5 border-t pt-5">
              <PromptField
                label="Evaluator persona (system)"
                hint="The grading system persona, before the shared output/safety footer the system appends."
                value={def.evaluationSystemPersona}
                onChange={(v) => patchDef({ evaluationSystemPersona: v })}
                rows={4}
                mono={false}
              />
              <PromptField
                label="Evaluation prompt (user)"
                hint="The grading user message. The teacher's Feedback focus is appended at runtime."
                value={def.evaluationPrompt}
                onChange={(v) => patchDef({ evaluationPrompt: v })}
                rows={10}
                vars={EVAL_VARS}
              />
            </div>
          </TabsContent>

          <TabsContent value="generation" className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Used by the &quot;Generate Rubric &amp; Expected Answer&quot;
              button in the teacher&apos;s question editor.
            </p>
            {GENERATION_FIELDS.map(({ key, label, hint }) => (
              <PromptField
                key={key}
                label={label}
                hint={hint}
                value={def.generation[key]}
                onChange={(v) => patchGeneration(key, v)}
                rows={3}
                mono={false}
              />
            ))}
          </TabsContent>

          <TabsContent value="dynamic-generation" className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Used by the dynamic question-generation endpoint, which
              generates each question at runtime from the student&apos;s
              submission instead of a teacher-fixed question.
            </p>
            {DYNAMIC_GENERATION_FIELDS.map(({ key, label, hint }) => (
              <PromptField
                key={key}
                label={label}
                hint={hint}
                value={def.generation[key]}
                onChange={(v) => patchGeneration(key, v)}
                rows={3}
                mono={false}
              />
            ))}
          </TabsContent>
        </Tabs>
      </SettingsCard>

      {/* Actions */}
      <SettingsCard className="space-y-5">
        <SectionHeading
          icon={Wrench}
          title="Actions (multimodal)"
        />
        <div className="space-y-2">
          <div className="space-y-3">
            {listImplementedActions().map((action) => {
              const toggleId = `template-action-toggle-${action.kind}`;
              return (
                <div
                  key={action.kind}
                  className="rounded-md border bg-muted/30 p-3"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <Label htmlFor={toggleId} className="text-sm">
                        {action.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {action.description}
                      </p>
                    </div>
                    <Switch
                      id={toggleId}
                      checked={def.defaults.multimodal.availableActions.includes(
                        action.kind,
                      )}
                      onCheckedChange={(on) =>
                        toggleAction(action.kind, on)
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs">
            <Lightbulb className="h-3.5 w-3.5" /> Bulb-button action
          </Label>
          <p className="text-xs text-muted-foreground">
            What the learner&apos;s bulb button triggers (e.g. Speaking
            Practice fires a suggested response).
          </p>
          <Select
            value={def.bulbAction}
            onValueChange={(v) =>
              patchDef({
                bulbAction: v as TemplateDefinition["bulbAction"],
              })
            }
          >
            <SelectTrigger className="sm:w-96">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {listImplementedActions().map((action) => (
                <SelectItem key={action.kind} value={action.kind}>
                  {action.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SettingsCard>

      {/* Labels */}
      <SettingsCard className="space-y-4">
        <SectionHeading
          icon={Tag}
          title="Field Labels"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {PRIMARY_LABEL_FIELDS.map(({ key, label }) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs">{label}</Label>
              <Input
                value={def.labels[key]}
                onChange={(e) => patchPrimaryLabel(key, e.target.value)}
              />
            </div>
          ))}
        </div>
        <Accordion type="single" collapsible>
          <AccordionItem value="advanced-labels" className="border-t">
            <AccordionTrigger className="py-2 text-xs font-medium text-muted-foreground hover:no-underline">
              Advanced — placeholders & wording (auto-filled from the labels
              above, edit to override)
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-4 pt-2 sm:grid-cols-2">
                {ADVANCED_LABEL_FIELDS.map(({ key, label }) => (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      value={def.labels[key]}
                      onChange={(e) =>
                        patchAdvancedLabel(key, e.target.value)
                      }
                    />
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </SettingsCard>

      {/* Sticky footer */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <Eye className="h-3.5 w-3.5" />
            Mockup — changes are in-memory only, nothing is saved to a database.
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onCancel} type="button">
              Cancel
            </Button>
            <Button onClick={() => onSave(draft)} type="button">
              {isNew ? "Create template" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}
