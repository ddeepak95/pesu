"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OpenEndedQuestion } from "@/types/survey";

export default function OpenEndedQuestionCard({
  question,
  index,
  totalQuestions,
  disabled,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  question: OpenEndedQuestion;
  index: number;
  totalQuestions: number;
  disabled?: boolean;
  onChange: (index: number, next: OpenEndedQuestion) => void;
  onDelete: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}) {
  const setPrompt = (prompt: string) =>
    onChange(index, { ...question, prompt });

  const setPlaceholder = (placeholder: string) =>
    onChange(index, { ...question, placeholder: placeholder || undefined });

  const setRequired = (required: boolean) =>
    onChange(index, { ...question, required });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Question {index + 1}</CardTitle>
          <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
            Open-Ended
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onMoveUp(index)}
            disabled={disabled || index === 0}
          >
            Up
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onMoveDown(index)}
            disabled={disabled || index === totalQuestions - 1}
          >
            Down
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => onDelete(index)}
            disabled={disabled || totalQuestions <= 1}
          >
            Delete
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor={`prompt-${index}`}>Question</Label>
          <Input
            id={`prompt-${index}`}
            value={question.prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={disabled}
            placeholder="Enter the question…"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`placeholder-${index}`}>
            Placeholder text (optional)
          </Label>
          <Input
            id={`placeholder-${index}`}
            value={question.placeholder || ""}
            onChange={(e) => setPlaceholder(e.target.value)}
            disabled={disabled}
            placeholder="e.g., Type your answer here…"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id={`required-${index}`}
            checked={question.required}
            onCheckedChange={(checked) => setRequired(checked === true)}
            disabled={disabled}
          />
          <Label
            htmlFor={`required-${index}`}
            className="text-sm font-medium leading-none cursor-pointer"
          >
            Required
          </Label>
        </div>
      </CardContent>
    </Card>
  );
}
