"use client";

import { useState } from "react";
import { nanoid } from "nanoid";
import MarkdownEditor from "@/components/Shared/MarkdownEditor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SurveyQuestion,
  LikertQuestion,
  OpenEndedQuestion,
  DropdownQuestion,
  SectionTitle,
  LIKERT_PRESETS,
} from "@/types/survey";
import LikertQuestionCard from "@/components/Teacher/Surveys/LikertQuestionCard";
import OpenEndedQuestionCard from "@/components/Teacher/Surveys/OpenEndedQuestionCard";
import DropdownQuestionCard from "@/components/Teacher/Surveys/DropdownQuestionCard";
import SectionTitleCard from "@/components/Teacher/Surveys/SectionTitleCard";

function newLikertQuestion(order: number): LikertQuestion {
  // Default to 5-point agreement scale
  const options = LIKERT_PRESETS.agreement_5.map((p) => ({
    id: nanoid(8),
    text: p.text,
    value: p.value,
  }));
  return {
    order,
    type: "likert",
    prompt: "",
    options,
    required: true,
  };
}

function newOpenEndedQuestion(order: number): OpenEndedQuestion {
  return {
    order,
    type: "open_ended",
    prompt: "",
    placeholder: "",
    required: false,
  };
}

function newDropdownQuestion(order: number): DropdownQuestion {
  return {
    order,
    type: "dropdown",
    prompt: "",
    options: ["", ""],
    required: true,
  };
}

function newSectionTitle(order: number): SectionTitle {
  return {
    order,
    type: "section_title",
    prompt: "",
    description: undefined,
    required: false,
  };
}

export default function SurveyForm({
  onSubmit,
  submitLabel = "Create Survey",
  initialTitle = "",
  initialDescription = "",
  initialQuestions,
  initialIsDraft = false,
}: {
  onSubmit: (data: {
    title: string;
    description: string;
    questions: SurveyQuestion[];
    isDraft: boolean;
  }) => Promise<void>;
  submitLabel?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialQuestions?: SurveyQuestion[];
  initialIsDraft?: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [questions, setQuestions] = useState<SurveyQuestion[]>(
    initialQuestions && initialQuestions.length > 0
      ? initialQuestions
      : [newLikertQuestion(0)]
  );
  const [isDraft, setIsDraft] = useState(initialIsDraft);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setQuestion = (index: number, next: SurveyQuestion) => {
    const copy = [...questions];
    copy[index] = next;
    copy.forEach((q, i) => (q.order = i));
    setQuestions(copy);
  };

  const addLikertQuestion = () =>
    setQuestions([...questions, newLikertQuestion(questions.length)]);

  const addOpenEndedQuestion = () =>
    setQuestions([...questions, newOpenEndedQuestion(questions.length)]);

  const addDropdownQuestion = () =>
    setQuestions([...questions, newDropdownQuestion(questions.length)]);

  const addSectionTitle = () =>
    setQuestions([...questions, newSectionTitle(questions.length)]);

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
    if (!title.trim()) return "Survey title is required";

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.prompt.trim()) {
        if (q.type === "section_title") {
          return `Section header ${i + 1}: title is required`;
        }
        return `Question ${i + 1}: question text is required`;
      }

      if (q.type === "likert") {
        if (!q.options || q.options.length < 2) {
          return `Question ${i + 1}: at least 2 scale options required`;
        }
        const filled = q.options.filter((o) => o.text.trim());
        if (filled.length < 2) {
          return `Question ${i + 1}: at least 2 options must have text`;
        }
      }

      if (q.type === "dropdown") {
        if (!q.options || q.options.length < 2) {
          return `Question ${i + 1}: at least 2 dropdown options required`;
        }
        const filled = q.options.filter((o) => o.trim());
        if (filled.length < 2) {
          return `Question ${i + 1}: at least 2 options must have text`;
        }
      }
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
      // Clean up questions
      const cleaned = questions.map((q, idx) => {
        if (q.type === "likert") {
          // Filter out empty options but keep at least 2
          const options = q.options.filter((o) => o.text.trim());
          const finalOptions =
            options.length >= 2 ? options : q.options.slice(0, 2);
          return {
            ...q,
            order: idx,
            options: finalOptions,
            prompt: q.prompt.trim(),
          };
        } else if (q.type === "dropdown") {
          const options = q.options.filter((o) => o.trim());
          const finalOptions =
            options.length >= 2 ? options : q.options.slice(0, 2);
          return {
            ...q,
            order: idx,
            options: finalOptions,
            prompt: q.prompt.trim(),
          };
        } else if (q.type === "section_title") {
          return {
            ...q,
            order: idx,
            prompt: q.prompt.trim(),
            description: q.description?.trim() || undefined,
          };
        } else {
          return {
            ...q,
            order: idx,
            prompt: q.prompt.trim(),
            placeholder: q.placeholder?.trim() || undefined,
          };
        }
      });

      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        questions: cleaned,
        isDraft,
      });
    } catch (err) {
      console.error("Error saving survey:", err);
      setError("Failed to save survey. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">Survey title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={loading}
          placeholder="e.g., Course Feedback Survey"
        />
      </div>

      {/* Instructions (markdown) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="description">Instructions (optional)</Label>
          <span className="text-xs text-muted-foreground">
            Markdown supported
          </span>
        </div>
        <MarkdownEditor
          id="description"
          value={description}
          onChange={setDescription}
          disabled={loading}
          placeholder="Enter instructions to display to students below the title..."
          rows={4}
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {questions.filter((q) => q.type !== "section_title").length} question
          {questions.filter((q) => q.type !== "section_title").length === 1
            ? ""
            : "s"}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" disabled={loading}>
              + Add question
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={addLikertQuestion}>
              Likert Scale
            </DropdownMenuItem>
            <DropdownMenuItem onClick={addOpenEndedQuestion}>
              Open-Ended Response
            </DropdownMenuItem>
            <DropdownMenuItem onClick={addDropdownQuestion}>
              Dropdown
            </DropdownMenuItem>
            <DropdownMenuItem onClick={addSectionTitle}>
              Section Title
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-4">
        {questions.map((q, idx) => {
          if (q.type === "likert") {
            return (
              <LikertQuestionCard
                key={idx}
                question={q}
                index={idx}
                totalQuestions={questions.length}
                disabled={loading}
                onChange={(i, next) => setQuestion(i, next)}
                onDelete={deleteQuestion}
                onMoveUp={(i) => move(i, "up")}
                onMoveDown={(i) => move(i, "down")}
              />
            );
          }
          if (q.type === "dropdown") {
            return (
              <DropdownQuestionCard
                key={idx}
                question={q}
                index={idx}
                totalQuestions={questions.length}
                disabled={loading}
                onChange={(i, next) => setQuestion(i, next)}
                onDelete={deleteQuestion}
                onMoveUp={(i) => move(i, "up")}
                onMoveDown={(i) => move(i, "down")}
              />
            );
          }
          if (q.type === "section_title") {
            return (
              <SectionTitleCard
                key={idx}
                question={q}
                index={idx}
                totalQuestions={questions.length}
                disabled={loading}
                onChange={(i, next) => setQuestion(i, next)}
                onDelete={deleteQuestion}
                onMoveUp={(i) => move(i, "up")}
                onMoveDown={(i) => move(i, "down")}
              />
            );
          }
          return (
            <OpenEndedQuestionCard
              key={idx}
              question={q as OpenEndedQuestion}
              index={idx}
              totalQuestions={questions.length}
              disabled={loading}
              onChange={(i, next) => setQuestion(i, next)}
              onDelete={deleteQuestion}
              onMoveUp={(i) => move(i, "up")}
              onMoveDown={(i) => move(i, "down")}
            />
          );
        })}
      </div>

      {/* Duplicate add-question button below the questions */}
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" disabled={loading}>
              + Add question
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={addLikertQuestion}>
              Likert Scale
            </DropdownMenuItem>
            <DropdownMenuItem onClick={addOpenEndedQuestion}>
              Open-Ended Response
            </DropdownMenuItem>
            <DropdownMenuItem onClick={addDropdownQuestion}>
              Dropdown
            </DropdownMenuItem>
            <DropdownMenuItem onClick={addSectionTitle}>
              Section Title
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
          {loading ? "Saving…" : isDraft ? submitLabel : "Publish"}
        </Button>
      </div>
    </form>
  );
}
