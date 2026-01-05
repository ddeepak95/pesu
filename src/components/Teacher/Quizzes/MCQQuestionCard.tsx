"use client";

import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MCQQuestion } from "@/types/quiz";

export default function MCQQuestionCard({
  question,
  index,
  totalQuestions,
  disabled,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  question: MCQQuestion;
  index: number;
  totalQuestions: number;
  disabled?: boolean;
  onChange: (index: number, next: MCQQuestion) => void;
  onDelete: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}) {
  const setPrompt = (prompt: string) =>
    onChange(index, { ...question, prompt });
  const setPoints = (points: number) =>
    onChange(index, { ...question, points });

  const addOption = () => {
    const newOption = { id: nanoid(8), text: "" };
    const nextOptions = [...question.options, newOption];
    onChange(index, {
      ...question,
      options: nextOptions,
      correct_option_id: question.correct_option_id || newOption.id,
    });
  };

  const updateOptionText = (optionId: string, text: string) => {
    const nextOptions = question.options.map((o) =>
      o.id === optionId ? { ...o, text } : o
    );
    onChange(index, { ...question, options: nextOptions });
  };

  const removeOption = (optionId: string) => {
    if (question.options.length <= 2) return;
    const nextOptions = question.options.filter((o) => o.id !== optionId);
    const nextCorrect =
      question.correct_option_id === optionId
        ? nextOptions[0]?.id || ""
        : question.correct_option_id;
    onChange(index, {
      ...question,
      options: nextOptions,
      correct_option_id: nextCorrect,
    });
  };

  const setCorrect = (correct_option_id: string) =>
    onChange(index, { ...question, correct_option_id });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">Question {index + 1}</CardTitle>
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
          <Label htmlFor={`prompt-${index}`}>Prompt</Label>
          <Input
            id={`prompt-${index}`}
            value={question.prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={disabled}
            placeholder="Enter the question…"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`points-${index}`}>Points</Label>
          <Input
            id={`points-${index}`}
            type="number"
            min={1}
            value={question.points}
            onChange={(e) => setPoints(Number(e.target.value))}
            disabled={disabled}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Options</Label>
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

          <div className="space-y-3">
            {question.options.map((opt, optIdx) => (
              <div key={opt.id} className="flex gap-2 items-center">
                <Input
                  value={opt.text}
                  onChange={(e) => updateOptionText(opt.id, e.target.value)}
                  disabled={disabled}
                  placeholder={`Option ${optIdx + 1}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeOption(opt.id)}
                  disabled={disabled || question.options.length <= 2}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Correct option</Label>
          <Select
            value={question.correct_option_id}
            onValueChange={setCorrect}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select the correct option" />
            </SelectTrigger>
            <SelectContent>
              {question.options.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.text || "(empty option)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}



