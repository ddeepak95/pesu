"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import QuestionCard from "@/components/Teacher/Assignments/QuestionCard";
import { Question, RubricItem } from "@/types/assignment";
import { supportedLanguages } from "@/utils/supportedLanguages";

interface AssignmentFormProps {
  mode: "create" | "edit";
  classId: string;
  assignmentId?: string;
  initialTitle?: string;
  initialQuestions?: Question[];
  initialLanguage?: string;
  initialIsPublic?: boolean;
  initialAssessmentMode?: "voice" | "text_chat" | "static_text";
  onSubmit: (data: {
    title: string;
    questions: Question[];
    totalPoints: number;
    preferredLanguage: string;
    isPublic: boolean;
    assessmentMode: "voice" | "text_chat" | "static_text";
  }) => Promise<void>;
}

export default function AssignmentForm({
  mode,
  classId,
  assignmentId,
  initialTitle = "",
  initialQuestions = [
    {
      order: 0,
      prompt: "",
      total_points: 0,
      rubric: [
        { item: "", points: 0 },
        { item: "", points: 0 },
      ],
      supporting_content: "",
    },
  ],
  initialLanguage = "en",
  initialIsPublic = false,
  initialAssessmentMode = "voice",
  onSubmit,
}: AssignmentFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [preferredLanguage, setPreferredLanguage] = useState(initialLanguage);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [assessmentMode, setAssessmentMode] = useState<
    "voice" | "text_chat" | "static_text"
  >(initialAssessmentMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleQuestionChange = (
    questionIndex: number,
    field: keyof Question,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any
  ) => {
    const newQuestions = [...questions];
    newQuestions[questionIndex] = {
      ...newQuestions[questionIndex],
      [field]: value,
    };
    setQuestions(newQuestions);
  };

  const handleRubricChange = (
    questionIndex: number,
    rubricIndex: number,
    field: keyof RubricItem,
    value: string | number
  ) => {
    const newQuestions = [...questions];
    const newRubric = [...newQuestions[questionIndex].rubric];
    newRubric[rubricIndex] = {
      ...newRubric[rubricIndex],
      [field]: value,
    };
    newQuestions[questionIndex].rubric = newRubric;

    // Auto-calculate total points for this question
    const total = newRubric.reduce((sum, item) => sum + (item.points || 0), 0);
    newQuestions[questionIndex].total_points = total;

    setQuestions(newQuestions);
  };

  const handleAddRubricItem = (questionIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[questionIndex].rubric.push({ item: "", points: 0 });
    setQuestions(newQuestions);
  };

  const handleRemoveRubricItem = (
    questionIndex: number,
    rubricIndex: number
  ) => {
    const newQuestions = [...questions];
    if (newQuestions[questionIndex].rubric.length > 1) {
      newQuestions[questionIndex].rubric = newQuestions[
        questionIndex
      ].rubric.filter((_, i) => i !== rubricIndex);

      // Recalculate total points for this question
      const total = newQuestions[questionIndex].rubric.reduce(
        (sum, item) => sum + (item.points || 0),
        0
      );
      newQuestions[questionIndex].total_points = total;

      setQuestions(newQuestions);
    }
  };

  const handleAddQuestion = () => {
    const newQuestion: Question = {
      order: questions.length,
      prompt: "",
      total_points: 0,
      rubric: [
        { item: "", points: 0 },
        { item: "", points: 0 },
      ],
      supporting_content: "",
    };
    setQuestions([...questions, newQuestion]);
  };

  const handleMoveQuestionUp = (index: number) => {
    if (index > 0) {
      const newQuestions = [...questions];
      [newQuestions[index - 1], newQuestions[index]] = [
        newQuestions[index],
        newQuestions[index - 1],
      ];
      // Update order
      newQuestions.forEach((q, i) => (q.order = i));
      setQuestions(newQuestions);
    }
  };

  const handleMoveQuestionDown = (index: number) => {
    if (index < questions.length - 1) {
      const newQuestions = [...questions];
      [newQuestions[index], newQuestions[index + 1]] = [
        newQuestions[index + 1],
        newQuestions[index],
      ];
      // Update order
      newQuestions.forEach((q, i) => (q.order = i));
      setQuestions(newQuestions);
    }
  };

  const handleDeleteQuestion = (index: number) => {
    if (questions.length > 1) {
      const newQuestions = questions.filter((_, i) => i !== index);
      // Update order
      newQuestions.forEach((q, i) => (q.order = i));
      setQuestions(newQuestions);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!title.trim()) {
      setError("Assignment title is required");
      return;
    }

    // Validate each question
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];

      if (!question.prompt.trim()) {
        setError(`Question ${i + 1}: Prompt is required`);
        return;
      }

      if (question.total_points <= 0) {
        setError(`Question ${i + 1}: Total points must be greater than 0`);
        return;
      }

      const validRubricItems = question.rubric.filter(
        (item) => item.item.trim() && item.points > 0
      );

      if (validRubricItems.length === 0) {
        setError(
          `Question ${i + 1}: At least one valid rubric item is required`
        );
        return;
      }
    }

    setLoading(true);

    try {
      // Clean up questions (remove empty rubric items)
      const cleanedQuestions = questions.map((q) => ({
        ...q,
        rubric: q.rubric.filter((item) => item.item.trim() && item.points > 0),
      }));

      // Calculate total points for assignment
      const totalPoints = cleanedQuestions.reduce(
        (sum, q) => sum + q.total_points,
        0
      );

      await onSubmit({
        title: title.trim(),
        questions: cleanedQuestions,
        totalPoints,
        preferredLanguage,
        isPublic,
        assessmentMode,
      });

      // Navigate based on mode
      if (mode === "edit" && assignmentId) {
        router.push(`/teacher/classes/${classId}/assignments/${assignmentId}`);
      } else {
        router.push(`/teacher/classes/${classId}`);
      }
    } catch (err) {
      console.error(
        `Error ${mode === "edit" ? "updating" : "creating"} assignment:`,
        err
      );
      setError(
        `Failed to ${
          mode === "edit" ? "update" : "create"
        } assignment. Please try again.`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Assignment Title */}
      <div className="space-y-2">
        <Label htmlFor="title">Assignment Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={loading}
          placeholder="Enter assignment title"
        />
      </div>

      {/* Assessment Mode */}
      <div className="space-y-2">
        <Label htmlFor="assessmentMode">Assessment Type</Label>
        <Select
          value={assessmentMode}
          onValueChange={(value) =>
            setAssessmentMode(value as "voice" | "text_chat" | "static_text")
          }
          disabled={loading}
        >
          <SelectTrigger id="assessmentMode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="voice">Voice assessment</SelectItem>
            <SelectItem value="text_chat">Text chat assessment</SelectItem>
            <SelectItem value="static_text">
              Static text assessment (coming soon)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Preferred Language */}
      <div className="space-y-2">
        <Label htmlFor="preferredLanguage">Preferred Language</Label>
        <Select
          value={preferredLanguage}
          onValueChange={setPreferredLanguage}
          disabled={loading}
        >
          <SelectTrigger id="preferredLanguage">
            <SelectValue placeholder="Select a language" />
          </SelectTrigger>
          <SelectContent>
            {supportedLanguages.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                {lang.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Public Access Toggle */}
      <div className="flex items-center space-x-2 p-4 border rounded-md bg-muted/30">
        <Checkbox
          id="isPublic"
          checked={isPublic}
          onCheckedChange={(checked) => setIsPublic(checked === true)}
          disabled={loading}
        />
        <div className="space-y-1">
          <Label
            htmlFor="isPublic"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            Make this assignment publicly accessible
          </Label>
          <p className="text-sm text-muted-foreground">
            Anyone with the link can view and complete this assignment without
            logging in
          </p>
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((question, index) => (
          <QuestionCard
            key={index}
            question={question}
            index={index}
            totalQuestions={questions.length}
            onChange={handleQuestionChange}
            onRubricChange={handleRubricChange}
            onAddRubricItem={handleAddRubricItem}
            onRemoveRubricItem={handleRemoveRubricItem}
            onMoveUp={handleMoveQuestionUp}
            onMoveDown={handleMoveQuestionDown}
            onDelete={handleDeleteQuestion}
            disabled={loading}
          />
        ))}
      </div>

      {/* Add Question Button */}
      <div className="flex justify-center">
        <Button
          type="button"
          variant="outline"
          onClick={handleAddQuestion}
          disabled={loading}
        >
          + Add Question
        </Button>
      </div>

      {/* Error Message */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Submit Button */}
      <div className="flex justify-center gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading
            ? mode === "edit"
              ? "Updating..."
              : "Creating..."
            : mode === "edit"
            ? "Update Assignment"
            : "Create Assignment"}
        </Button>
      </div>
    </form>
  );
}
