import { Button } from "@/components/ui/button";

interface QuizSubmissionBarProps {
  isSubmitted: boolean;
  needsCompletion?: boolean;
  isSubmitting: boolean;
  canSubmit: boolean;
  showPoints: boolean;
  earnedPoints: number | null;
  totalPoints: number | null;
  onSubmit: () => void;
}

export default function QuizSubmissionBar({
  isSubmitted,
  needsCompletion = false,
  isSubmitting,
  canSubmit,
  showPoints,
  earnedPoints,
  totalPoints,
  onSubmit,
}: QuizSubmissionBarProps) {
  return (
    <div className="flex flex-col items-center gap-3 pt-4">
      {isSubmitted ? (
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Submission received</p>
          {showPoints && earnedPoints !== null && totalPoints !== null ? (
            <p className="text-lg font-semibold">
              Score: {earnedPoints}/{totalPoints}
            </p>
          ) : null}
        </div>
      ) : (
        <Button onClick={onSubmit} disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? "Submitting..." : "Submit answers"}
        </Button>
      )}
      {isSubmitted && needsCompletion && (
        <div className="text-center space-y-2" role="status">
          <p className="text-sm text-muted-foreground">
            Your answers are saved. Completion still needs to be recorded.
          </p>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Saving completion..." : "Retry completion"}
          </Button>
        </div>
      )}
    </div>
  );
}
