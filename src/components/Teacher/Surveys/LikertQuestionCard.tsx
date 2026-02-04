"use client";

import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LikertQuestion,
  LikertOption,
  LIKERT_PRESETS,
  LikertPresetKey,
} from "@/types/survey";

export default function LikertQuestionCard({
  question,
  index,
  totalQuestions,
  disabled,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  question: LikertQuestion;
  index: number;
  totalQuestions: number;
  disabled?: boolean;
  onChange: (index: number, next: LikertQuestion) => void;
  onDelete: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}) {
  const setPrompt = (prompt: string) =>
    onChange(index, { ...question, prompt });

  const setRequired = (required: boolean) =>
    onChange(index, { ...question, required });

  const addOption = () => {
    const nextValue =
      question.options.length > 0
        ? Math.max(...question.options.map((o) => o.value)) + 1
        : 1;
    const newOption: LikertOption = {
      id: nanoid(8),
      text: "",
      value: nextValue,
    };
    onChange(index, {
      ...question,
      options: [...question.options, newOption],
    });
  };

  const updateOption = (optionId: string, updates: Partial<LikertOption>) => {
    const nextOptions = question.options.map((o) =>
      o.id === optionId ? { ...o, ...updates } : o
    );
    onChange(index, { ...question, options: nextOptions });
  };

  const removeOption = (optionId: string) => {
    if (question.options.length <= 2) return;
    const nextOptions = question.options.filter((o) => o.id !== optionId);
    onChange(index, { ...question, options: nextOptions });
  };

  const applyPreset = (presetKey: string) => {
    if (presetKey === "custom") return;
    const preset = LIKERT_PRESETS[presetKey as LikertPresetKey];
    if (preset) {
      const options = preset.map((p) => ({
        id: nanoid(8),
        text: p.text,
        value: p.value,
      }));
      onChange(index, { ...question, options });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Question {index + 1}</CardTitle>
          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
            Likert Scale
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
            <Label>Scale Options</Label>
            <div className="flex gap-2">
              <Select onValueChange={applyPreset} disabled={disabled}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Apply preset…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agreement_5">
                    Agreement (5-point)
                  </SelectItem>
                  <SelectItem value="satisfaction_5">
                    Satisfaction (5-point)
                  </SelectItem>
                  <SelectItem value="frequency_5">
                    Frequency (5-point)
                  </SelectItem>
                  <SelectItem value="likelihood_5">
                    Likelihood (5-point)
                  </SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
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
          </div>

          <div className="space-y-2">
            {question.options.map((opt, optIdx) => (
              <div key={opt.id} className="flex gap-2 items-center">
                <Input
                  className="w-16"
                  type="number"
                  value={opt.value}
                  onChange={(e) =>
                    updateOption(opt.id, { value: Number(e.target.value) })
                  }
                  disabled={disabled}
                  placeholder="Value"
                />
                <Input
                  className="flex-1"
                  value={opt.text}
                  onChange={(e) =>
                    updateOption(opt.id, { text: e.target.value })
                  }
                  disabled={disabled}
                  placeholder={`Option ${optIdx + 1} label`}
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
      </CardContent>
    </Card>
  );
}
