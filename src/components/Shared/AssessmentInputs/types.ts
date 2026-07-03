import { Question, BotPromptConfig } from "@/types/assignment";
import { SubmissionAttempt } from "@/types/submission";

/**
 * Shared props contract that all assessment input areas (Voice, Chat, StaticText) implement.
 * The AssessmentShell passes these down; each input area only handles its own interaction logic.
 */
export interface AssessmentInputProps {
  question: Question;
  language: string;
  assignmentId: string;
  submissionId: string;
  existingAnswer?: string;
  maxAttemptsReached?: boolean;
  attempts: SubmissionAttempt[];
  /**
   * The attempt_number the next attempt will be recorded under (= max over all
   * attempts incl. stale + 1). Input areas that persist per-attempt data before
   * evaluation (e.g. multimodal conversation/audio) must key it by this so the
   * rows match the number the evaluate route assigns.
   */
  nextAttemptNumber: number;
  isEvaluating: boolean;

  onSubmitForEvaluation: (answerText: string) => Promise<void>;
  onLanguageDisabledChange?: (disabled: boolean) => void;
  onNavigationDisabledChange?: (disabled: boolean) => void;
  /**
   * Voice assessments: true while getUserMedia is awaiting so the shell can
   * pause tab-leave integrity tracking during the browser permission prompt.
   */
  onVoiceMicPermissionRequestPendingChange?: (pending: boolean) => void;

  botPromptConfig?: BotPromptConfig;
  /**
   * Multimodal only: the learner-selected (or teacher-locked) support language
   * the bulb button uses for re-explanations. Chosen alongside the main
   * language before the activity starts.
   */
  supportLanguage?: string;
  maxAttempts?: number;
  sharedContext?: string;
  evaluationPrompt?: string;
  /** When true, paste and clipboard shortcuts are allowed in text areas */
  allowCopyPaste?: boolean;
  /** Chat API returned integrity lock */
  onIntegrityAccessRevoked?: () => void;
  /** Pre-fetched formatted content of uploaded files for prompt interpolation */
  fileSubmissionsContent?: string;
  /** Activity type for prompt defaults (learning / assessment / speaking practice). */
  activityType?: import("@/lib/activityTypes/types").ActivityTypeKind;
  /**
   * The assignment's self-contained definition snapshot. Drives the inverted
   * action↔type wiring (autoActions / bulbAction) at runtime — read via
   * `resolveAutoActions` / `resolveBulbAction`, which fall back to the built-in
   * `activityType` for legacy assignments that predate the snapshot.
   */
  activityDefinitionSnapshot?:
    | import("@/lib/activityTypes/templates").TemplateDefinition
    | null;
  /** Assignment title for prompt interpolation */
  title?: string;
  /** Student instructions for prompt interpolation */
  studentInstructions?: string;
}
