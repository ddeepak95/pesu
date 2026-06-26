import type { TabSwitchPolicy } from "@/lib/integrity/constants";
import type { MultimodalActionsConfig } from "@/lib/multimodal/turnConfig";
import type { ActivityTypeKind } from "@/lib/activityTypes/types";

export interface FileSubmissionConfig {
  required: boolean;
  allow_multiple: boolean;
  instructions?: string;
  allowed_file_types?: string[];
}

/** Selectable extensions in the assignment builder (teacher UI). */
export const FILE_SUBMISSION_TYPE_OPTIONS: readonly {
  ext: string;
  label: string;
}[] = [
  { ext: ".pdf", label: "PDF" },
  { ext: ".txt", label: "Plain text (.txt)" },
  { ext: ".py", label: "Python (.py)" },
  { ext: ".rmd", label: "R Markdown (.rmd)" },
];

const _FILE_SUBMISSION_EXT_ORDER = FILE_SUBMISSION_TYPE_OPTIONS.map((o) => o.ext);

/** Default selection when file submission is enabled (PDF only). */
export const DEFAULT_FILE_SUBMISSION_ALLOWED_TYPES: readonly string[] = [
  ".pdf",
];

/** Normalize selected extensions to option order, unique, known types only. */
export function orderFileSubmissionExtensions(exts: Iterable<string>): string[] {
  const known = new Set(_FILE_SUBMISSION_EXT_ORDER);
  const selected = new Set(
    [...exts].map((e) => e.toLowerCase()).filter((e) => known.has(e)),
  );
  return _FILE_SUBMISSION_EXT_ORDER.filter((e) => selected.has(e));
}

/**
 * Allowed upload extensions for an assignment. Unknown or empty storage
 * falls back to PDF-only.
 */
export function allowedFileTypesFromConfig(
  config: FileSubmissionConfig | null | undefined,
): string[] {
  const ordered = orderFileSubmissionExtensions(
    config?.allowed_file_types ?? [],
  );
  return ordered.length > 0
    ? ordered
    : [...DEFAULT_FILE_SUBMISSION_ALLOWED_TYPES];
}

/**
 * Stored in DB column `dynamic_question_focuses` (jsonb).
 * Defines how many questions to generate, points each, and what they should cover.
 */
export interface DynamicGenerationSpec {
  question_count: number;
  points_per_question: number;
  coverage_description: string;
}

export const DEFAULT_DYNAMIC_GENERATION_SPEC: DynamicGenerationSpec = {
  question_count: 1,
  points_per_question: 10,
  coverage_description:
    "The questions should thoroughly evaluate the understanding of the topic based on the student's submission.",
};

/** Parse jsonb value; returns null if missing or legacy/invalid shape. */
export function parseDynamicGenerationSpec(
  value: unknown,
): DynamicGenerationSpec | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const qc = o.question_count;
  const pp = o.points_per_question;
  const cd = o.coverage_description;
  if (
    typeof qc !== "number" ||
    typeof pp !== "number" ||
    typeof cd !== "string" ||
    !Number.isInteger(qc) ||
    !Number.isInteger(pp) ||
    qc < 1 ||
    pp < 1
  ) {
    return null;
  }
  return {
    question_count: qc,
    points_per_question: pp,
    coverage_description: cd,
  };
}

/** True when spec is valid for persisting and for generation API. */
export function isCompleteDynamicGenerationSpec(
  spec: DynamicGenerationSpec,
): boolean {
  return (
    spec.question_count >= 1 &&
    spec.points_per_question >= 1 &&
    spec.coverage_description.trim().length > 0
  );
}

export interface RubricItem {
  item: string;
  points: number;
}

export interface Question {
  order: number;
  prompt: string;
  total_points: number;
  rubric: RubricItem[];
  supporting_content: string;
  expected_answer?: string;
  /**
   * When `dynamic_prompt` is true, guidelines for what the generated question
   * should cover. Falls back to `prompt` if unset (legacy rows).
   */
  question_focus?: string;
  /** When true, teacher text is guidelines for file-based generation at student time. */
  dynamic_prompt?: boolean;
  /** When true, rubric and expected answer are generated at student time from files. */
  dynamic_rubric?: boolean;
}

/**
 * Text the teacher is editing: static `prompt` (final question), or
 * `question_focus` when dynamic — guidelines for the question (with legacy fallback to `prompt`).
 */
export function teacherPromptOrFocus(q: Question): string {
  if (q.dynamic_prompt === true) {
    const f = q.question_focus?.trim();
    if (f) return q.question_focus ?? "";
    return q.prompt;
  }
  return q.prompt;
}

/** True if any question uses per-submission generation (requires file submission). */
export function assignmentHasDynamicQuestionParts(questions: Question[]): boolean {
  return questions.some(
    (q) => q.dynamic_prompt === true || q.dynamic_rubric === true,
  );
}

/** Strip dynamic flags when file submission is off (call on save). */
export function stripDynamicFlagsFromQuestions(questions: Question[]): Question[] {
  return questions.map((q) => ({
    ...q,
    dynamic_prompt: false,
    dynamic_rubric: false,
  }));
}

export interface ResponderFieldConfig {
  field: string; // unique field identifier (e.g., "name", "email", "organization")
  type: "text" | "email" | "tel" | "select";
  label: string; // display label
  required: boolean;
  placeholder?: string;
  options?: string[]; // for select type
}

/**
 * Configuration for how the AI bot starts conversations.
 * Supports different greetings for first question vs subsequent questions.
 */
export interface ConversationStartConfig {
  first_question: string; // Greeting/intro for the first question
  subsequent_questions: string; // Greeting for questions 2+
}

/**
 * Per-question override for bot behavior.
 * Simpler than BotPromptConfig - just system_prompt and a single conversation_start.
 */
export interface QuestionPromptOverride {
  system_prompt?: string;
  conversation_start?: string; // Single greeting for this specific question
}

/**
 * Configuration for AI bot behavior in voice and chat assessment modes.
 * Uses variable placeholders like {{language}}, {{question_prompt}}, {{rubric}}, etc.
 */
export interface BotPromptConfig {
  system_prompt: string;
  conversation_start: ConversationStartConfig;
  /**
   * Optional per-question overrides for system prompt and conversation start.
   * Key is the question order (0-based index).
   */
  question_overrides?: Record<number, QuestionPromptOverride>;
  /**
   * Multimodal-only: which rich actions (MCQ, etc.) the tutor may use, and when
   * to end the conversation. Only consulted in multimodal assessment mode.
   */
  multimodal_actions?: MultimodalActionsConfig;
}

export interface Assignment {
  id: string;
  assignment_id: string;
  class_id: string;
  class_group_id?: string | null;
  title: string;
  questions: Question[];
  total_points: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: "draft" | "active" | "deleted";
  preferred_language: string;
  is_public: boolean;
  /**
   * Assessment delivery mode for this assignment.
   * Defaults to "voice" for legacy assignments where this field is missing.
   */
  assessment_mode?: "voice" | "text_chat" | "static_text" | "multimodal";
  /**
   * Activity type for this assignment.
   * Defaults to "learning" for legacy assignments where this field is missing.
   */
  activity_type?: ActivityTypeKind;
  /**
   * Configuration for responder details collection in public assignments.
   * Defines what fields to collect from public responders.
   */
  responder_fields_config?: ResponderFieldConfig[];
  /**
   * Maximum number of attempts allowed per student for this assignment.
   * Defaults to 1 if not specified.
   */
  max_attempts?: number;
  /**
   * Configuration for AI bot behavior in voice and chat assessment modes.
   * Contains system prompt template and conversation start configurations.
   * If not set, server uses default hardcoded prompts.
   */
  bot_prompt_config?: BotPromptConfig;
  /**
   * When true, students cannot change the interaction language during the assessment.
   * The language is fixed to preferred_language.
   */
  lock_language?: boolean;
  /**
   * Display-only instructions shown to students before they start the assessment.
   * Not passed to the AI prompt - purely for student information.
   */
  student_instructions?: string;
  /**
   * Whether to show the rubric to students during the assessment.
   * Defaults to true for backwards compatibility.
   */
  show_rubric?: boolean;
  /**
   * Whether to show rubric point values to students.
   * Only applies when show_rubric is true.
   * Defaults to true for backwards compatibility.
   */
  show_rubric_points?: boolean;
  /**
   * Whether to show star ratings instead of points to students.
   * Defaults to false for backwards compatibility.
   */
  use_star_display?: boolean;
  /**
   * Number of stars in the rating scale (e.g., 5, 10, 20).
   * Only applies when use_star_display is true.
   * Defaults to 5.
   */
  star_scale?: number;
  /**
   * Whether the teacher views stars or points in their submissions view.
   * Defaults to false (points).
   */
  teacher_view_stars?: boolean;
  /**
   * When true, students must attempt all questions before marking complete.
   * Defaults to false for backwards compatibility.
   */
  require_all_attempts?: boolean;
  /**
   * When true, additional context is included in AI prompts (stored as shared_context_enabled).
   * Defaults to false.
   */
  shared_context_enabled?: boolean;
  /**
   * Additional context text (e.g. case study, passage). Stored as shared_context in the DB.
   * Only passed to prompts when shared_context_enabled is true.
   */
  shared_context?: string;
  /**
   * Custom evaluation prompt template. If set, replaces the hardcoded evaluation prompt.
   * Supports placeholders including {{context_for_ai}} (legacy: {{shared_context}}).
   */
  evaluation_prompt?: string;
  /**
   * When true, students are asked to rate their experience when completing the assessment.
   * Defaults to false.
   */
  experience_rating_enabled?: boolean;
  /**
   * When true, students must provide a rating before completing (otherwise they can skip).
   * Only applies when experience_rating_enabled is true.
   * Defaults to false.
   */
  experience_rating_required?: boolean;
  /**
   * When true, AI-generated feedback is held pending teacher review before being shown to students.
   * The teacher can edit the feedback before approving it.
   * Defaults to false (instant feedback).
   */
  feedback_requires_approval?: boolean;
  /**
   * Release strategy when feedback_requires_approval is true.
   * false (default) = release each student's grade as it is finalized.
   * true = "hold all, release together": finalized grades stay hidden from students
   * until the teacher opens the assignment-level gate (grades_released_at).
   */
  batch_grade_release?: boolean;
  /**
   * Assignment-level release gate (batch mode). When set, finalized submissions become
   * visible to students; null = held. Only meaningful when batch_grade_release is true.
   */
  grades_released_at?: string | null;
  /**
   * When true, students may use copy/paste in text chat and static text answer fields.
   * Defaults to false (matches legacy restrictive behavior).
   */
  allow_copy_paste?: boolean;
  /**
   * Tab visibility policy: allow (log only), warn (modal on return), block_after_threshold (lock after N leaves).
   * Defaults to warn when missing (legacy behavior for class assignments).
   */
  tab_switch_policy?: TabSwitchPolicy;
  /**
   * Max tab hidden events before integrity lock; required when tab_switch_policy is block_after_threshold.
   */
  tab_switch_max_leaves?: number | null;
  /**
   * Configuration for file submission requirements.
   * When set with required: true, students must upload files before answering questions.
   */
  file_submission_config?: FileSubmissionConfig | null;
  /**
   * When true, file submission is required and at least one question has
   * `dynamic_prompt` or `dynamic_rubric`; students receive a merged `generated_questions` snapshot.
   */
  dynamic_questions_enabled?: boolean;
  /**
   * Legacy jsonb column; unused with per-question flags — persist null.
   */
  dynamic_question_focuses?: DynamicGenerationSpec | null;
  /**
   * Custom system prompt template for dynamic question generation.
   * When null/undefined, the API uses a built-in default.
   * Supports template variables like {{title}}, {{generation_spec}}, etc.
   */
  dynamic_generation_prompt?: string | null;
}

