import { Card, CardContent } from "@/components/ui/card";
import { MCQQuestion } from "@/types/quiz";

interface QuizQuestionCardProps {
  question: MCQQuestion;
  selectedOptionId?: string;
  showPoints: boolean;
  disabled?: boolean;
  onSelect: (optionId: string) => void;
}

export default function QuizQuestionCard({
  question,
  selectedOptionId,
  showPoints,
  disabled = false,
  onSelect,
}: QuizQuestionCardProps) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-4">
          <p className="whitespace-pre-wrap">{question.prompt}</p>
          {showPoints ? (
            <span className="text-sm text-muted-foreground">
              {question.points} pts
            </span>
          ) : null}
        </div>

        <div className="space-y-2">
          {question.options.map((option) => {
            const checked = selectedOptionId === option.id;
            return (
              <label
                key={option.id}
                className={`flex items-center gap-3 rounded-md border px-3 py-2 transition ${
                  checked ? "border-primary/60 bg-primary/5" : "border-muted"
                } ${
                  disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"
                }`}
              >
                <input
                  type="radio"
                  name={`question-${question.order}`}
                  value={option.id}
                  checked={checked}
                  onChange={() => onSelect(option.id)}
                  disabled={disabled}
                  className="h-4 w-4"
                />
                <span>{option.text}</span>
              </label>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
