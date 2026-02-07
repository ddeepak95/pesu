"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownQuestion } from "@/types/survey";

export default function DropdownQuestionCard({
  question,
  index,
  totalQuestions,
  disabled,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  question: DropdownQuestion;
  index: number;
  totalQuestions: number;
  disabled?: boolean;
  onChange: (index: number, next: DropdownQuestion) => void;
  onDelete: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}) {
  const setPrompt = (prompt: string) =>
    onChange(index, { ...question, prompt });

  const setRequired = (required: boolean) =>
    onChange(index, { ...question, required });

  const addOption = () => {
    onChange(index, { ...question, options: [...question.options, ""] });
  };

  const updateOption = (optionIndex: number, value: string) => {
    const nextOptions = [...question.options];
    nextOptions[optionIndex] = value;
    onChange(index, { ...question, options: nextOptions });
  };

  const removeOption = (optionIndex: number) => {
    if (question.options.length <= 2) return;
    const nextOptions = question.options.filter((_, i) => i !== optionIndex);
    onChange(index, { ...question, options: nextOptions });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Question {index + 1}</CardTitle>
          <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
            Dropdown
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

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Dropdown Options</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addOption}
              disabled={disabled}
            >
              + Add option
            </Button>
          </div>

          <div className="space-y-2">
            {question.options.map((opt, optIdx) => (
              <div key={optIdx} className="flex gap-2 items-center">
                <span className="text-sm text-muted-foreground w-6 text-right">
                  {optIdx + 1}.
                </span>
                <Input
                  className="flex-1"
                  value={opt}
                  onChange={(e) => updateOption(optIdx, e.target.value)}
                  disabled={disabled}
                  placeholder={`Option ${optIdx + 1}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeOption(optIdx)}
                  disabled={disabled || question.options.length <= 2}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
