"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import RubricItemRow from "@/components/Teacher/Assignments/RubricItemRow";
import { Question, RubricItem } from "@/types/assignment";
import { ArrowUp, ArrowDown, Trash2, Sparkles, Loader2 } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface QuestionCardProps {
  question: Question;
  index: number;
  totalQuestions: number;
  preferredLanguage: string;
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
  preferredLanguage,
  onChange,
  onRubricChange,
  onAddRubricItem,
  onRemoveRubricItem,
  onMoveUp,
  onMoveDown,
  onDelete,
  disabled = false,
}: QuestionCardProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Validate rubric points match total points
  const validateRubricPoints = () => {
    const validRubricItems = question.rubric.filter(
      (item) => item.item.trim() && item.points > 0
    );
    if (validRubricItems.length === 0) return null;
    
    const rubricSum = validRubricItems.reduce(
      (sum, item) => sum + (item.points || 0),
      0
    );
    if (rubricSum !== question.total_points) {
      return `Rubric points (${rubricSum}) must equal total points (${question.total_points})`;
    }
    return null;
  };

  const rubricValidationError = validateRubricPoints();

  const handleGenerateWithAI = async () => {
    // Validate that both prompt and total points are entered
    if (!question.prompt.trim()) {
      setGenerationError("Please enter a question prompt first");
      return;
    }

    if (!question.total_points || question.total_points <= 0) {
      setGenerationError("Please enter total points for this question first");
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const response = await fetch("/api/generate-rubric-and-answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          questionPrompt: question.prompt,
          supportingContent: question.supporting_content || undefined,
          language: preferredLanguage, // Optional fallback
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate rubric and answer");
      }

      const data = await response.json();
      console.log("AI Generation Response:", data);

      // Create new array references to ensure React detects the change
      const newRubric = data.rubric.map((item: RubricItem) => ({ ...item }));
      console.log("Processed Rubric:", newRubric);

      let finalRubric: RubricItem[];
      let finalTotalPoints: number;

      // If total points is already set, distribute them across rubric items
      // Otherwise, use the sum of AI-generated points
      if (question.total_points > 0) {
        // Distribute user-entered total points across rubric items
        const totalPoints = question.total_points;
        
        // Use AI-generated points as weights for proportional distribution
        const totalAIPoints = newRubric.reduce(
          (sum: number, item: RubricItem) => sum + item.points,
          0
        );
        
        if (totalAIPoints > 0) {
          // Distribute proportionally based on AI weights
          let distributedSum = 0;
          const distributedRubric = newRubric.map((item: RubricItem, idx: number) => {
            if (idx === newRubric.length - 1) {
              // Last item gets remainder to ensure exact total
              const points = totalPoints - distributedSum;
              distributedSum += points;
              return { ...item, points };
            } else {
              const points = Math.round((item.points / totalAIPoints) * totalPoints);
              distributedSum += points;
              return { ...item, points };
            }
          });
          
          // Ensure we create a completely new array reference
          finalRubric = distributedRubric.map((item) => ({ ...item }));
          finalTotalPoints = totalPoints;
        } else {
          // Equal distribution if no AI points
          const pointsPerItem = Math.floor(totalPoints / newRubric.length);
          const remainder = totalPoints % newRubric.length;
          const distributedRubric = newRubric.map((item: RubricItem, idx: number) => ({
            ...item,
            points: pointsPerItem + (idx < remainder ? 1 : 0),
          }));
          // Ensure we create a completely new array reference
          finalRubric = distributedRubric.map((item) => ({ ...item }));
          finalTotalPoints = totalPoints;
        }
      } else {
        // Calculate total points from AI-generated rubric
        finalTotalPoints = newRubric.reduce(
          (sum: number, item: RubricItem) => sum + item.points,
          0
        );
        // Ensure we create a completely new array reference
        finalRubric = newRubric.map((item) => ({ ...item }));
      }

      // Update all fields - ensure rubric gets a completely new array reference
      // Create fresh objects to ensure React detects the change
      // Don't filter - keep all items from AI (they should all be valid)
      const rubricCopy = finalRubric.map((item) => ({
        item: String(item.item || ""),
        points: Number(item.points || 0),
      }));
      
      console.log("Updating rubric with:", rubricCopy, "for question index:", index);
      console.log("Current question rubric before update:", question.rubric);
      
      // Update rubric first - this should trigger a re-render
      onChange(index, "rubric", rubricCopy);
      
      // Update other fields immediately - React will batch these
      if (question.total_points !== finalTotalPoints) {
        onChange(index, "total_points", finalTotalPoints);
      }
      onChange(index, "expected_answer", data.expectedAnswer || "");
      
      console.log("State updates called for question", index);
    } catch (error) {
      console.error("Error generating rubric and answer:", error);
      setGenerationError(
        error instanceof Error ? error.message : "Failed to generate content"
      );
    } finally {
      setIsGenerating(false);
    }
  };
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

      {/* Total Points */}
      <div className="space-y-2">
        <Label htmlFor={`totalPoints-${index}`}>
          Total Points <span className="text-destructive">*</span>
        </Label>
        <Input
          id={`totalPoints-${index}`}
          type="number"
          value={question.total_points || ""}
          onChange={(e) => {
            const value = parseInt(e.target.value, 10);
            onChange(index, "total_points", isNaN(value) ? 0 : Math.max(0, value));
          }}
          disabled={disabled}
          min={0}
          className="w-32"
        />
        <p className="text-xs text-muted-foreground">
          Enter the total points for this question
        </p>
      </div>

      {/* Prompt */}
      <div className="space-y-2">
        <Label htmlFor={`prompt-${index}`}>
          Prompt <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id={`prompt-${index}`}
          value={question.prompt}
          onChange={(e) => onChange(index, "prompt", e.target.value)}
          disabled={disabled}
          placeholder="Enter question prompt"
          rows={4}
        />
      </div>

      {/* AI Generate Button */}
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleGenerateWithAI}
          disabled={
            disabled ||
            isGenerating ||
            !question.prompt.trim() ||
            !question.total_points ||
            question.total_points <= 0
          }
          className="w-full"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          {isGenerating ? "Generating..." : "Generate Rubric & Expected Answer with AI"}
        </Button>
        {isGenerating && (
          <div className="flex items-center gap-2 p-4 border rounded-md bg-muted/30">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <div className="text-sm">
              <p className="font-medium">AI is processing your question...</p>
              <p className="text-muted-foreground">
                Detecting language and generating rubric
              </p>
            </div>
          </div>
        )}
        {generationError && (
          <p className="text-sm text-destructive">{generationError}</p>
        )}
      </div>

      {/* Rubric */}
      <div className="space-y-2">
        <div>
          <Label>
            Rubric <span className="text-destructive">*</span>
          </Label>
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

        {rubricValidationError && (
          <p className="text-sm text-destructive">{rubricValidationError}</p>
        )}

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

      {/* Expected Answer */}
      <div className="space-y-2">
        <Label htmlFor={`expectedAnswer-${index}`}>Expected Answer</Label>
        <Textarea
          id={`expectedAnswer-${index}`}
          value={question.expected_answer || ""}
          onChange={(e) =>
            onChange(index, "expected_answer", e.target.value)
          }
          disabled={disabled}
          placeholder="Enter details about what the answer should cover (optional)"
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          Key points the answer should cover. This guides AI evaluation and won't be shown to learners.
        </p>
      </div>

      {/* Supporting Content - Collapsible */}
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value={`supporting-content-${index}`}>
          <AccordionTrigger>Supporting Content</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
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
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
