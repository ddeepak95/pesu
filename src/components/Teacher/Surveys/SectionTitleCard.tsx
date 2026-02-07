"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionTitle } from "@/types/survey";

export default function SectionTitleCard({
  question,
  index,
  totalQuestions,
  disabled,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  question: SectionTitle;
  index: number;
  totalQuestions: number;
  disabled?: boolean;
  onChange: (index: number, next: SectionTitle) => void;
  onDelete: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}) {
  const setPrompt = (prompt: string) =>
    onChange(index, { ...question, prompt });

  const setDescription = (description: string) =>
    onChange(index, {
      ...question,
      description: description || undefined,
    });

  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Section Header</CardTitle>
          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
            Section Title
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
          <Label htmlFor={`section-title-${index}`}>Section Title</Label>
          <Input
            id={`section-title-${index}`}
            value={question.prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={disabled}
            placeholder="Enter section title…"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`section-desc-${index}`}>
            Description (optional)
          </Label>
          <Textarea
            id={`section-desc-${index}`}
            value={question.description || ""}
            onChange={(e) => setDescription(e.target.value)}
            disabled={disabled}
            placeholder="Enter an optional description for this section…"
            rows={2}
            className="resize-none"
          />
        </div>
      </CardContent>
    </Card>
  );
}
