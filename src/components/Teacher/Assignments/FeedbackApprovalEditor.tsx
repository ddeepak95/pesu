import { EditableAttemptGradingForm } from "@/components/Teacher/Assignments/EditableAttemptGradingForm";
import type { SubmissionAttempt } from "@/types/submission";

interface FeedbackApprovalEditorProps {
  attempt: SubmissionAttempt;
  submissionId: string;
  questionOrder: number;
  onApproved: (updatedAttempt: SubmissionAttempt) => void;
}

/**
 * Teacher-facing panel for reviewing, optionally editing, and approving
 * AI-generated feedback before it is shown to the student.
 *
 * Self-contained: manages its own draft state and loading state.
 */
export function FeedbackApprovalEditor({
  attempt,
  submissionId,
  questionOrder,
  onApproved,
}: FeedbackApprovalEditorProps) {
  return (
    <EditableAttemptGradingForm
      attempt={attempt}
      submissionId={submissionId}
      questionOrder={questionOrder}
      onSaved={onApproved}
    />
  );
}
