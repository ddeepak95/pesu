"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardCheck,
  Eye,
  IdCard,
  Lightbulb,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Tag,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SettingsCard } from "@/components/ui/settings-card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { showErrorToast, showSuccessToast } from "@/lib/toast";

import { PromptField } from "./PromptField";
import {
  type MockTemplate,
  type TemplateDefinition,
  type Visibility,
} from "./types";
import {
  bareVarName,
  validateFields,
  type ValidatableField,
  type ValidationIssue,
} from "./validateTemplate";

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

const GREETING_VARS = PROMPT_VARS;
const EVAL_VARS = [...PROMPT_VARS, "{{answer_text}}"];
const ACTION_VARS = listImplementedActions().map((a) => `{{action:${a.kind}}}`);
const LANGUAGE_SUPPORT_VARS = ["{{language}}", "{{support_language}}"];

// Bare (brace-stripped) equivalents of the vars lists above, for the
// "{{#if variable}}" / "{{variable}}" validator, which checks against bare names.
const PROMPT_VAR_NAMES = PROMPT_VARS.map(bareVarName);
const GREETING_VAR_NAMES = PROMPT_VAR_NAMES;
const EVAL_VAR_NAMES = EVAL_VARS.map(bareVarName);
const ACTION_VAR_NAMES = ACTION_VARS.map(bareVarName);
const LANGUAGE_SUPPORT_VAR_NAMES = LANGUAGE_SUPPORT_VARS.map(bareVarName);

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
    label: "Runtime question-generation guidance",
    hint: "Extra rules for the runtime question-generation endpoint.",
  },
];

/** Card-level heading — one per SettingsCard, larger than any subheading inside it. */
function SectionHeading({
  icon: Icon,
  title,
  tooltip,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <h4 className="text-base font-semibold text-foreground">{title}</h4>
      {tooltip && <InfoTooltip text={tooltip} />}
    </div>
  );
}

/** A subheading within a flowing (non-tabbed) list of sections inside one card. */
function Subsection({
  title,
  tooltip,
  required = false,
  divider = true,
  children,
}: {
  title: string;
  tooltip?: string;
  required?: boolean;
  /** Whether to draw a divider above this subsection. Set false to visually
   * group it with the subsection before it (same sub-group). */
  divider?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={divider ? "space-y-5 border-t pt-5" : "space-y-5"}>
      <div className="flex items-center gap-1.5">
        <h5 className="text-sm font-semibold text-foreground">
          {title}
          {required && <span className="text-destructive"> *</span>}
        </h5>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      {children}
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
  primary: Pick<
    TemplateDefinition["labels"],
    "question" | "rubric" | "expectedAnswer"
  >,
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

/** Every prompt-ish field, paired with its recognized variables, for the Validate button. */
function buildValidatableFields(def: TemplateDefinition): ValidatableField[] {
  return [
    {
      id: "systemPrompt",
      label: "Conversation system prompt",
      value: def.systemPrompt,
      required: true,
      knownVars: PROMPT_VAR_NAMES,
    },
    {
      id: "actionDirective",
      label: "Action directive",
      value: def.actionDirective,
      knownVars: ACTION_VAR_NAMES,
    },
    {
      id: "languageSupportDirective",
      label: "Language support directive",
      value: def.languageSupportDirective,
      knownVars: LANGUAGE_SUPPORT_VAR_NAMES,
    },
    {
      id: "conversationStart.first_question",
      label: "First-question greeting",
      value: def.conversationStart.first_question,
      knownVars: GREETING_VAR_NAMES,
    },
    {
      id: "conversationStart.subsequent_questions",
      label: "Subsequent-question greeting",
      value: def.conversationStart.subsequent_questions,
      knownVars: GREETING_VAR_NAMES,
    },
    {
      id: "endConditionInstruction",
      label: "Conversation end condition",
      value: def.endConditionInstruction,
      required: true,
    },
    {
      id: "evaluationSystemPersona",
      label: "Evaluator persona (system)",
      value: def.evaluationSystemPersona,
    },
    {
      id: "evaluationPrompt",
      label: "Evaluation prompt (user)",
      value: def.evaluationPrompt,
      knownVars: EVAL_VAR_NAMES,
    },
    {
      id: "generation.rubricCoverage",
      label: "Rubric coverage",
      value: def.generation.rubricCoverage,
    },
    {
      id: "generation.expectedAnswerCoverage",
      label: "Expected-answer coverage",
      value: def.generation.expectedAnswerCoverage,
    },
    {
      id: "generation.dynamicGenerationGuidance",
      label: "Runtime question-generation guidance",
      value: def.generation.dynamicGenerationGuidance,
    },
  ];
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
  // Validation must be re-run (and pass) after every edit before Save unlocks —
  // tracked by snapshotting the definition at the moment Validate was last run.
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>(
    [],
  );
  const [validatedSnapshot, setValidatedSnapshot] = useState<string | null>(
    null,
  );
  const [showErrorDialog, setShowErrorDialog] = useState(false);

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

  const defSnapshot = JSON.stringify(def);
  const isValidated = validatedSnapshot === defSnapshot;
  const canSave = isValidated && validationIssues.length === 0;

  const runValidation = () => {
    const issues = validateFields(buildValidatableFields(def));
    setValidationIssues(issues);
    setValidatedSnapshot(defSnapshot);
    if (issues.length === 0) {
      showSuccessToast("All prompts are valid.");
    } else {
      showErrorToast(
        `${issues.length} issue${issues.length === 1 ? "" : "s"} found — see details.`,
      );
      setShowErrorDialog(true);
    }
  };

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
            Everything the author owns to shape the AI conversation, evaluation,
            and question-generation behavior for this activity type.
          </p>
        </div>

        {/* Identity */}
        <SettingsCard className="space-y-4">
          <SectionHeading
            icon={IdCard}
            title="Template details"
            tooltip="Name, description, and visibility shown in the template gallery and picker."
          />
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
              <div className="flex items-center gap-1.5">
                <Label>Visibility</Label>
                <InfoTooltip text="Private: only its owner sees it. Public: any teacher can open its shared link and clone it (no browsable gallery)." />
              </div>
              <Select
                value={draft.visibility}
                onValueChange={(v) => patch({ visibility: v as Visibility })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="public">Public (shared link)</SelectItem>
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

        {/* General settings */}
        <div className="pt-2">
          <h2 className="text-lg font-semibold text-foreground">
            General settings
          </h2>
        </div>
        <SettingsCard className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-sm">
              Interaction type
              <InfoTooltip text="Preselected interaction mode (applied only if the class allows it)." />
            </span>
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
            <span className="flex items-center gap-1.5 text-sm">
              Require file submission
              <InfoTooltip text="Learners must upload a file (e.g. code, a document) before they can submit their answer." />
            </span>
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
          <label className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-sm">
              Show scores as stars
              <InfoTooltip text="Shows the learner's score as a star rating instead of a raw number/percentage." />
            </span>
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

        {/* AI configuration */}
        <div className="space-y-1 pt-2">
          <h2 className="text-lg font-semibold text-foreground">
            AI configuration
          </h2>
          <p className="text-sm text-muted-foreground">
            The prompts and copy that drive the AI conversation, evaluation, and
            question-generation features for this activity type.
          </p>
        </div>

        <SettingsCard className="space-y-6">
          <SectionHeading
            icon={MessageSquare}
            title="Conversation"
            tooltip="Everything that shapes the live back-and-forth with the learner — persona, on-screen actions, greetings, and when to end."
          />

          <Subsection
            title="Conversation system prompt"
            tooltip="Who the AI is and what it should do — the core instructions sent with every turn of the conversation. This is where the conversation language is set: name it via {{language}} in the persona. No need to restate what the system appends automatically — conciseness/format, native-script/no-romanization, and safety. Do put this type's tone here (e.g. an assessment stays neutral)."
            required
            divider={false}
          >
            <PromptField
              value={def.systemPrompt}
              onChange={(v) => patchDef({ systemPrompt: v })}
              rows={16}
              vars={PROMPT_VARS}
            />
          </Subsection>

          <Subsection
            title="Multimodal actions"
            tooltip="On-screen actions (like showing an MCQ or suggesting a response) the AI can trigger during a multimodal conversation. Select these before writing the action directive below, so it can reference them by name."
            divider={false}
          >
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
                        <div className="flex items-center gap-1.5">
                          <Label htmlFor={toggleId} className="text-sm">
                            {action.label}
                          </Label>
                          <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                            action:{action.kind}
                          </code>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {action.description}
                        </p>
                      </div>
                      <Switch
                        id={toggleId}
                        checked={def.defaults.multimodal.availableActions.includes(
                          action.kind,
                        )}
                        onCheckedChange={(on) => toggleAction(action.kind, on)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-4 pt-1">
              <span className="flex items-center gap-1.5 text-xs">
                <Label className="flex items-center gap-1.5 text-xs">
                  <Lightbulb className="h-3.5 w-3.5" /> Bulb-button action
                </Label>
                <InfoTooltip text="What the learner's bulb button triggers (e.g. Speaking Practice fires a suggested response)." />
              </span>
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
          </Subsection>

          <Subsection
            title="Action directive"
            tooltip="How/when to use this type's enabled actions in context (e.g. tie an MCQ's topic to the rubric). Not general persona text — that belongs in the system prompt above. Reference a selected action by its live label with {{action:kind}}."
            divider={false}
          >
            <PromptField
              value={def.actionDirective}
              onChange={(v) => patchDef({ actionDirective: v })}
              rows={5}
              vars={ACTION_VARS}
              placeholder="Leave blank when this type has no action-specific context to add."
            />
          </Subsection>

          <Subsection title="Language support" divider={false}>
            <label className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-sm">
                Language support enabled by default
                <InfoTooltip text="Lets the learner pick a second, 'support' language to get help in alongside the primary language, if the class allows it." />
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
            <PromptField
              label="Language support directive"
              hint="Replaces the default 'language support available' rule when a support language is configured. Governs mid-conversation help only — the opening (greetings above) and grading language (evaluation prompt) handle the support language separately; keep all three consistent. No need to say 'in its native script' — that's applied to every reply automatically. Leave blank to use the default (e.g. Speaking Practice overrides it to stay in character and continue in the support language instead of translating)."
              value={def.languageSupportDirective}
              onChange={(v) => patchDef({ languageSupportDirective: v })}
              rows={4}
              vars={LANGUAGE_SUPPORT_VARS}
              placeholder="Leave blank for the default below."
            />
          </Subsection>

          <Subsection
            title="Conversation start greetings"
            tooltip="What the AI opens with, before the student has answered anything. The system prompt already sets the conversation language, so don't prefix 'speak in {{language}}' here. If a support language is set, any special opening behavior (e.g. deliver the setup in the support language) is defined here — keep it consistent with the Language support directive below."
          >
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
              hint="What the AI opens with, after the student has answered the first question."
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
          </Subsection>

          <Subsection
            title="Conversation end condition"
            tooltip="When the model should end the conversation — drives the runtime endConversation signal. Layered on top of the always-on default rule that closes the conversation warmly."
            required
          >
            <PromptField
              value={def.endConditionInstruction}
              onChange={(v) => patchDef({ endConditionInstruction: v })}
              rows={3}
              placeholder="e.g. the learner has thoroughly answered the question, or has explicitly refused to engage."
            />
          </Subsection>
        </SettingsCard>

        <SettingsCard className="space-y-6">
          <SectionHeading
            icon={ClipboardCheck}
            title="Evaluation & feedback"
            tooltip="Default feedback focus areas and the prompts used to grade a student's answer once they submit."
          />

          <Subsection
            title="Feedback focus"
            tooltip="Each area becomes a section in the student's feedback. The title is the section heading; the description tells the AI what that section should cover. This steers the feedback, not the score."
            divider={false}
          >
            <FeedbackFocusEditor
              value={def.defaultFeedbackFocusAreas}
              onChange={(v) => patchDef({ defaultFeedbackFocusAreas: v })}
              hideLabel
            />
          </Subsection>

          <Subsection
            title="Evaluator persona (system)"
            tooltip="The grading system persona, before the shared output/safety footer the system appends."
          >
            <PromptField
              value={def.evaluationSystemPersona}
              onChange={(v) => patchDef({ evaluationSystemPersona: v })}
              rows={4}
              mono={false}
            />
          </Subsection>

          <Subsection
            title="Evaluation prompt (user)"
            tooltip="The grading user message. The teacher's Feedback focus is appended at runtime."
            divider={false}
          >
            <PromptField
              value={def.evaluationPrompt}
              onChange={(v) => patchDef({ evaluationPrompt: v })}
              rows={10}
              vars={EVAL_VARS}
            />
          </Subsection>
        </SettingsCard>

        <SettingsCard className="space-y-6">
          <SectionHeading
            icon={Sparkles}
            title="Auto-generation"
            tooltip="Copy used by teacher-facing and runtime auto-generation tools — not read during the live conversation."
          />

          <Subsection
            title="Rubric & expected-answer autofill"
            tooltip="Copy used only by the one-time 'Generate Rubric & Expected Answer' button in the teacher's question editor — not read at conversation runtime."
            divider={false}
          >
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
          </Subsection>

          <Subsection
            title="Runtime question generation"
            tooltip="Copy used by the endpoint that generates each question live from the student's submission, instead of a teacher-fixed question."
          >
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
          </Subsection>
        </SettingsCard>

        {/* UI configurations */}
        <div className="pt-2">
          <h2 className="text-lg font-semibold text-foreground">
            UI Configurations
          </h2>
        </div>

        {/* Labels */}
        <SettingsCard className="space-y-4">
          <SectionHeading
            icon={Tag}
            title="Field Labels"
            tooltip="Renames the Question/Rubric/Expected-answer fields and their placeholder text as shown to teachers building an assignment with this activity type."
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

        {/* Validation errors dialog */}
        <Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                {validationIssues.length} issue
                {validationIssues.length === 1 ? "" : "s"} found
              </DialogTitle>
              <DialogDescription>
                Fix these before the template can be saved.
              </DialogDescription>
            </DialogHeader>
            <ul className="max-h-96 list-disc space-y-2 overflow-y-auto pl-5 text-sm">
              {validationIssues.map((issue, i) => (
                <li key={`${issue.fieldId}-${i}`}>
                  <span className="font-medium">{issue.fieldLabel}:</span>{" "}
                  {issue.message}
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button onClick={() => setShowErrorDialog(false)} type="button">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Sticky footer */}
        <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <Eye className="h-3.5 w-3.5" />
              Mockup — changes are in-memory only, nothing is saved to a
              database.
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onCancel} type="button">
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={runValidation}
                type="button"
              >
                <ShieldCheck className="h-4 w-4" />
                Validate
              </Button>
              <Button
                onClick={() => onSave(draft)}
                type="button"
                disabled={!canSave}
                title={
                  !canSave
                    ? "Run Validate and resolve any issues before saving"
                    : undefined
                }
              >
                {isNew ? "Create template" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
