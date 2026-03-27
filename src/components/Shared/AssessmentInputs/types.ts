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
  isEvaluating: boolean;

  onSubmitForEvaluation: (answerText: string) => Promise<void>;
  onLanguageDisabledChange?: (disabled: boolean) => void;
  onNavigationDisabledChange?: (disabled: boolean) => void;

  botPromptConfig?: BotPromptConfig;
  maxAttempts?: number;
  sharedContext?: string;
  evaluationPrompt?: string;
  /** When true, paste and clipboard shortcuts are allowed in text areas */
  allowCopyPaste?: boolean;
  /** Chat API returned integrity lock */
  onIntegrityAccessRevoked?: () => void;
  /** Pre-fetched formatted content of uploaded files for prompt interpolation */
  fileSubmissionsContent?: string;
  /** Activity type for prompt defaults (assessment vs learning) */
  activityType?: "assessment" | "learning";
}
