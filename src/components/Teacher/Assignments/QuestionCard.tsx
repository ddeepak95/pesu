"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import RubricItemRow from "@/components/Teacher/Assignments/RubricItemRow";
import { Question, RubricItem } from "@/types/assignment";
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";

interface QuestionCardProps {
  question: Question;
  index: number;
  totalQuestions: number;
  onChange: (
    index: number,
    field: keyof Question,
    value: Question[keyof Question]
  ) => void;
  onRubricChange: (
    questionIndex: number,
    rubricIndex: number,
    field: keyof RubricItem,
    value: string | number
  ) => void;
  onAddRubricItem: (questionIndex: number) => void;
  onRemoveRubricItem: (questionIndex: number, rubricIndex: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onDelete: (index: number) => void;
  disabled?: boolean;
}

export default function QuestionCard({
  question,
  index,
  totalQuestions,
  onChange,
  onRubricChange,
  onAddRubricItem,
  onRemoveRubricItem,
  onMoveUp,
  onMoveDown,
  onDelete,
  disabled = false,
}: QuestionCardProps) {
  return (
    <div className="border rounded-lg p-6 space-y-4 bg-card">
      {/* Question Header with Controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Question {index + 1}</h3>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onMoveUp(index)}
            disabled={disabled || index === 0}
            title="Move up"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onMoveDown(index)}
            disabled={disabled || index === totalQuestions - 1}
            title="Move down"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onDelete(index)}
            disabled={disabled || totalQuestions === 1}
            title="Delete question"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Prompt */}
      <div className="space-y-2">
        <Label htmlFor={`prompt-${index}`}>Prompt</Label>
        <Textarea
          id={`prompt-${index}`}
          value={question.prompt}
          onChange={(e) => onChange(index, "prompt", e.target.value)}
          disabled={disabled}
          placeholder="Enter question prompt"
          rows={4}
        />
      </div>

      {/* Total Points */}
      <div className="space-y-2">
        <Label htmlFor={`totalPoints-${index}`}>Total points</Label>
        <Input
          id={`totalPoints-${index}`}
          type="number"
          value={question.total_points}
          disabled={true}
          min={0}
          className="w-32"
        />
        <p className="text-xs text-muted-foreground">
          Automatically calculated from rubric items
        </p>
      </div>

      {/* Rubric */}
      <div className="space-y-2">
        <div>
          <Label>Rubric</Label>
          <div className="flex gap-8 mt-2 text-sm text-muted-foreground">
            <span>Item</span>
            <span className="ml-auto">Points</span>
          </div>
        </div>

        <div className="space-y-2">
          {question.rubric.map((item, rubricIndex) => (
            <RubricItemRow
              key={rubricIndex}
              item={item}
              index={rubricIndex}
              onChange={(rubricIdx, field, value) =>
                onRubricChange(index, rubricIdx, field, value)
              }
              onRemove={(rubricIdx) => onRemoveRubricItem(index, rubricIdx)}
              disabled={disabled}
            />
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => onAddRubricItem(index)}
          disabled={disabled}
          size="sm"
        >
          Add Rubric Item
        </Button>
      </div>

      {/* Supporting Content */}
      <div className="space-y-2">
        <Label htmlFor={`supportingContent-${index}`}>Supporting Content</Label>
        <Textarea
          id={`supportingContent-${index}`}
          value={question.supporting_content}
          onChange={(e) =>
            onChange(index, "supporting_content", e.target.value)
          }
          disabled={disabled}
          placeholder="Enter any supporting content or instructions"
          rows={4}
        />
      </div>
    </div>
  );
}
