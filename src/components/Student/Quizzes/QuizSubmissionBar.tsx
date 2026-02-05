import { Button } from "@/components/ui/button";

interface QuizSubmissionBarProps {
  isSubmitted: boolean;
  isSubmitting: boolean;
  canSubmit: boolean;
  showPoints: boolean;
  earnedPoints: number | null;
  totalPoints: number | null;
  onSubmit: () => void;
}

export default function QuizSubmissionBar({
  isSubmitted,
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
    </div>
  );
}
