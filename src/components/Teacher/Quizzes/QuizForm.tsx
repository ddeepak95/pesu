"use client";

import { useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MCQQuestion } from "@/types/quiz";
import MCQQuestionCard from "@/components/Teacher/Quizzes/MCQQuestionCard";

function newQuestion(order: number): MCQQuestion {
  const a = { id: nanoid(8), text: "" };
  const b = { id: nanoid(8), text: "" };
  return {
    order,
    prompt: "",
    options: [a, b],
    correct_option_id: a.id,
    points: 1,
  };
}

export default function QuizForm({
  onSubmit,
  submitLabel = "Create Quiz",
  initialTitle = "",
  initialQuestions,
  initialIsDraft = false,
}: {
  onSubmit: (data: {
    title: string;
    questions: MCQQuestion[];
    isDraft: boolean;
  }) => Promise<void>;
  submitLabel?: string;
  initialTitle?: string;
  initialQuestions?: MCQQuestion[];
  initialIsDraft?: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [questions, setQuestions] = useState<MCQQuestion[]>(
    initialQuestions && initialQuestions.length > 0
      ? initialQuestions
      : [newQuestion(0)]
  );
  const [isDraft, setIsDraft] = useState(initialIsDraft);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPoints = useMemo(
    () => questions.reduce((sum, q) => sum + (q.points || 0), 0),
    [questions]
  );

  const setQuestion = (index: number, next: MCQQuestion) => {
    const copy = [...questions];
    copy[index] = next;
    copy.forEach((q, i) => (q.order = i));
    setQuestions(copy);
  };

  const addQuestion = () =>
    setQuestions([...questions, newQuestion(questions.length)]);

  const deleteQuestion = (index: number) => {
    if (questions.length <= 1) return;
    const next = questions.filter((_, i) => i !== index);
    next.forEach((q, i) => (q.order = i));
    setQuestions(next);
  };

  const move = (index: number, dir: "up" | "down") => {
    const j = dir === "up" ? index - 1 : index + 1;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[index], next[j]] = [next[j], next[index]];
    next.forEach((q, i) => (q.order = i));
    setQuestions(next);
  };

  const validate = (): string | null => {
    if (!title.trim()) return "Quiz title is required";

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.prompt.trim()) return `Question ${i + 1}: prompt is required`;
      if (!q.points || q.points <= 0)
        return `Question ${i + 1}: points must be > 0`;
      if (!q.options || q.options.length < 2)
        return `Question ${i + 1}: at least 2 options required`;
      const filled = q.options.filter((o) => o.text.trim());
      if (filled.length < 2)
        return `Question ${i + 1}: at least 2 options must have text`;
      const hasCorrect = q.options.some((o) => o.id === q.correct_option_id);
      if (!hasCorrect) return `Question ${i + 1}: select a correct option`;
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      // Strip empty options but keep at least 2
      const cleaned = questions.map((q, idx) => {
        const options = q.options.filter((o) => o.text.trim());
        const finalOptions =
          options.length >= 2 ? options : q.options.slice(0, 2);
        const correct = finalOptions.some((o) => o.id === q.correct_option_id)
          ? q.correct_option_id
          : finalOptions[0].id;
        return {
          ...q,
          order: idx,
          options: finalOptions,
          correct_option_id: correct,
          prompt: q.prompt.trim(),
        };
      });

      await onSubmit({ title: title.trim(), questions: cleaned, isDraft });
    } catch (err) {
      console.error("Error creating quiz:", err);
      setError("Failed to create quiz. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">Quiz title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={loading}
          placeholder="e.g., Newton's Laws (MCQ)"
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {questions.length} question{questions.length === 1 ? "" : "s"} •{" "}
          {totalPoints} points total
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={addQuestion}
          disabled={loading}
        >
          + Add question
        </Button>
      </div>

      <div className="space-y-4">
        {questions.map((q, idx) => (
          <MCQQuestionCard
            key={idx}
            question={q}
            index={idx}
            totalQuestions={questions.length}
            disabled={loading}
            onChange={setQuestion}
            onDelete={deleteQuestion}
            onMoveUp={(i) => move(i, "up")}
            onMoveDown={(i) => move(i, "down")}
          />
        ))}
      </div>

      <div className="flex items-center space-x-2 p-4 border rounded-md bg-muted/30">
        <Checkbox
          id="isDraft"
          checked={isDraft}
          onCheckedChange={(checked) => setIsDraft(checked === true)}
          disabled={loading}
        />
        <div className="space-y-1">
          <Label
            htmlFor="isDraft"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            Save as draft
          </Label>
          <p className="text-sm text-muted-foreground">
            Draft items are visible to teachers but not available to students
            yet.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Creating…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}



