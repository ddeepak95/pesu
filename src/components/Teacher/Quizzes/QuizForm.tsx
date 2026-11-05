"use client";

import { useMemo, useState } from "react";
import { nanoid } from "nanoid";
import MarkdownEditor from "@/components/Shared/MarkdownEditor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MCQQuestion } from "@/types/quiz";
import MCQQuestionCard from "@/components/Teacher/Quizzes/MCQQuestionCard";
import QuizImageManager from "@/components/Teacher/Quizzes/QuizImageManager";
import { invalidateQuizImages } from "@/hooks/swr/useQuizImages";
import { removeQuizImage } from "@/lib/quizzes/removeImage";

function newQuestion(order: number): MCQQuestion {
  const id = nanoid(10);
  const a = { id: nanoid(8), text: "" };
  const b = { id: nanoid(8), text: "" };
  return {
    id,
    order,
    prompt: "",
    prompt_format: "markdown",
    options: [a, b],
    correct_option_id: a.id,
    points: 1,
  };
}

function ensureQuestionIds(questions: MCQQuestion[]): MCQQuestion[] {
  return questions.map((q) => ({
    ...q,
    id: q.id || nanoid(10),
  }));
}

export default function QuizForm({
  classId,
  onSubmit,
  submitLabel = "Create Quiz",
  initialTitle = "",
  initialInstructions = "",
  initialQuestions,
  initialIsDraft = false,
  initialRandomizeQuestions = false,
  initialRandomizeOptions = false,
  initialShowPointsToStudents = true,
}: {
  classId: string;
  onSubmit: (data: {
    title: string;
    instructions: string;
    questions: MCQQuestion[];
    isDraft: boolean;
    randomizeQuestions: boolean;
    randomizeOptions: boolean;
    showPointsToStudents: boolean;
  }) => Promise<void>;
  submitLabel?: string;
  initialTitle?: string;
  initialInstructions?: string;
  initialQuestions?: MCQQuestion[];
  initialIsDraft?: boolean;
  initialRandomizeQuestions?: boolean;
  initialRandomizeOptions?: boolean;
  initialShowPointsToStudents?: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [instructions, setInstructions] = useState(initialInstructions);
  const [questions, setQuestions] = useState<MCQQuestion[]>(
    initialQuestions && initialQuestions.length > 0
      ? ensureQuestionIds(initialQuestions)
      : [newQuestion(0)]
  );
  const [isDraft, setIsDraft] = useState(initialIsDraft);
  const [randomizeQuestions, setRandomizeQuestions] = useState(
    initialRandomizeQuestions
  );
  const [randomizeOptions, setRandomizeOptions] = useState(
    initialRandomizeOptions
  );
  const [showPointsToStudents, setShowPointsToStudents] = useState(
    initialShowPointsToStudents
  );
  const [saving, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingImage, setDeletingImage] = useState(false);
  const loading = saving || uploading || deletingImage;
  const [error, setError] = useState<string | null>(null);

  const totalPoints = useMemo(
    () => questions.reduce((sum, q) => sum + (q.points || 0), 0),
    [questions]
  );

  const setQuestion = (_index: number, next: MCQQuestion) => {
    setQuestions(previous => previous.map((q, order) => ({ ...(q.id === next.id ? next : q), order })));
  };

  const addQuestion = () =>
    setQuestions(previous => [...previous, newQuestion(previous.length)]);

  const deleteQuestion = (index: number) => {
    setQuestions(previous => previous.length <= 1 ? previous : previous.filter((_, i) => i !== index).map((q, order) => ({ ...q, order })));
  };

  const move = (index: number, dir: "up" | "down") => {
    setQuestions(previous => {
      const j = dir === "up" ? index - 1 : index + 1;
      if (j < 0 || j >= previous.length) return previous;
      const next = [...previous];
      [next[index], next[j]] = [next[j], next[index]];
      return next.map((q, order) => ({ ...q, order }));
    });
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
    if (loading) return;
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
          id: q.id || nanoid(10),
          order: idx,
          options: finalOptions,
          correct_option_id: correct,
          prompt: q.prompt.trim(),
        };
      });

      await onSubmit({
        title: title.trim(),
        instructions: instructions.trim(),
        questions: cleaned,
        isDraft,
        randomizeQuestions,
        randomizeOptions,
        showPointsToStudents,
      });
      await invalidateQuizImages(classId);
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

      {/* Instructions (markdown) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="instructions">Instructions (optional)</Label>
          <span className="text-xs text-muted-foreground">
            Markdown supported
          </span>
        </div>
        <MarkdownEditor
          id="instructions"
          value={instructions}
          onChange={setInstructions}
          disabled={loading}
          placeholder="Enter instructions to display to students below the title..."
          rows={4}
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
            key={q.id}
            classId={classId}
            onUploadPendingChange={setUploading}
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

      <QuizImageManager classId={classId} questions={questions} disabled={loading} onPendingChange={setDeletingImage}
        onRemove={imageId => setQuestions(previous => previous.map(q => q.prompt_format === "markdown"
          ? { ...q, prompt: removeQuizImage(q.prompt, imageId) } : q))} />

      <div className="space-y-3 p-4 border rounded-md bg-muted/30">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="randomizeQuestions"
            checked={randomizeQuestions}
            onCheckedChange={(checked) => setRandomizeQuestions(checked === true)}
            disabled={loading}
          />
          <Label
            htmlFor="randomizeQuestions"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            Randomize question order for students
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="randomizeOptions"
            checked={randomizeOptions}
            onCheckedChange={(checked) => setRandomizeOptions(checked === true)}
            disabled={loading}
          />
          <Label
            htmlFor="randomizeOptions"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            Randomize option order for students
          </Label>
        </div>
        <p className="text-sm text-muted-foreground">
          Randomization applies per session and does not change the correct
          answers.
        </p>
      </div>

      <div className="flex items-center space-x-2 p-4 border rounded-md bg-muted/30">
        <Checkbox
          id="showPointsToStudents"
          checked={showPointsToStudents}
          onCheckedChange={(checked) => setShowPointsToStudents(checked === true)}
          disabled={loading}
        />
        <div className="space-y-1">
          <Label
            htmlFor="showPointsToStudents"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            Show points to students
          </Label>
          <p className="text-sm text-muted-foreground">
            Controls whether students see point values and scores.
          </p>
        </div>
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
          {uploading ? "Uploading images…" : saving ? "Saving…" : isDraft ? submitLabel : "Publish"}
        </Button>
      </div>
    </form>
  );
}



