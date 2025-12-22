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
import { Question, RubricItem, ResponderFieldConfig } from "@/types/assignment";
import { supportedLanguages } from "@/utils/supportedLanguages";
import { Trash2, Plus } from "lucide-react";

interface AssignmentFormProps {
  mode: "create" | "edit";
  classId: string;
  assignmentId?: string;
  initialTitle?: string;
  initialQuestions?: Question[];
  initialLanguage?: string;
  initialIsPublic?: boolean;
  initialAssessmentMode?: "voice" | "text_chat" | "static_text";
  initialResponderFieldsConfig?: ResponderFieldConfig[];
  initialMaxAttempts?: number;
  onSubmit: (data: {
    title: string;
    questions: Question[];
    totalPoints: number;
    preferredLanguage: string;
    isPublic: boolean;
    assessmentMode: "voice" | "text_chat" | "static_text";
    isDraft: boolean;
    responderFieldsConfig?: ResponderFieldConfig[];
    maxAttempts?: number;
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
  initialResponderFieldsConfig,
  initialMaxAttempts = 1,
  onSubmit,
}: AssignmentFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [preferredLanguage, setPreferredLanguage] = useState(initialLanguage);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [isDraft, setIsDraft] = useState(false);
  const [assessmentMode, setAssessmentMode] = useState<
    "voice" | "text_chat" | "static_text"
  >(initialAssessmentMode);
  const [maxAttempts, setMaxAttempts] = useState(initialMaxAttempts);
  const [responderFieldsConfig, setResponderFieldsConfig] = useState<
    ResponderFieldConfig[]
  >(
    initialResponderFieldsConfig || [
      {
        field: "name",
        type: "text",
        label: "Your Name",
        required: true,
        placeholder: "Enter your name",
      },
    ]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleQuestionChange = (
    questionIndex: number,
    field: keyof Question,
    value: Question[keyof Question]
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
        isDraft,
        responderFieldsConfig: isPublic ? responderFieldsConfig : undefined,
        maxAttempts,
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

      {/* Max Attempts */}
      <div className="space-y-2">
        <Label htmlFor="maxAttempts">Maximum Attempts</Label>
        <Input
          id="maxAttempts"
          type="number"
          min="1"
          value={maxAttempts}
          onChange={(e) => {
            const value = parseInt(e.target.value, 10);
            if (!isNaN(value) && value >= 1) {
              setMaxAttempts(value);
            }
          }}
          disabled={loading}
          placeholder="1"
        />
        <p className="text-sm text-muted-foreground">
          Number of attempts students can make for this assignment. Default is 1
          (single attempt).
        </p>
      </div>

      {/* Draft Toggle */}
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

      {/* Responder Fields Configuration (only for public assignments) */}
      {isPublic && (
        <div className="space-y-4 p-4 border rounded-md">
          <div className="space-y-2">
            <Label>Responder Information Fields</Label>
            <p className="text-sm text-muted-foreground">
              Configure what information to collect from public responders
            </p>
          </div>

          {responderFieldsConfig.map((field, index) => (
            <div key={index} className="p-4 border rounded-md space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Field {index + 1}</Label>
                {responderFieldsConfig.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const newFields = responderFieldsConfig.filter(
                        (_, i) => i !== index
                      );
                      setResponderFieldsConfig(newFields);
                    }}
                    disabled={loading}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`field-${index}-label`}>Label</Label>
                  <Input
                    id={`field-${index}-label`}
                    value={field.label}
                    onChange={(e) => {
                      const newFields = [...responderFieldsConfig];
                      newFields[index].label = e.target.value;
                      setResponderFieldsConfig(newFields);
                    }}
                    placeholder="e.g., Full Name"
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`field-${index}-type`}>Type</Label>
                  <Select
                    value={field.type}
                    onValueChange={(value) => {
                      const newFields = [...responderFieldsConfig];
                      newFields[index].type =
                        value as ResponderFieldConfig["type"];
                      // Clear options if not select type
                      if (value !== "select") {
                        delete newFields[index].options;
                      }
                      setResponderFieldsConfig(newFields);
                    }}
                    disabled={loading}
                  >
                    <SelectTrigger id={`field-${index}-type`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="tel">Phone</SelectItem>
                      <SelectItem value="select">Select (Dropdown)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`field-${index}-field`}>Field Identifier</Label>
                <Input
                  id={`field-${index}-field`}
                  value={field.field}
                  onChange={(e) => {
                    const newFields = [...responderFieldsConfig];
                    newFields[index].field = e.target.value;
                    setResponderFieldsConfig(newFields);
                  }}
                  placeholder="e.g., name, email, organization"
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">
                  Unique identifier for this field (used in data storage)
                </p>
              </div>

              {field.type === "select" && (
                <div className="space-y-2">
                  <Label htmlFor={`field-${index}-options`}>
                    Options (one per line)
                  </Label>
                  <textarea
                    id={`field-${index}-options`}
                    className="w-full min-h-[80px] px-3 py-2 text-sm border rounded-md"
                    value={field.options?.join("\n") || ""}
                    onChange={(e) => {
                      const newFields = [...responderFieldsConfig];
                      newFields[index].options = e.target.value
                        .split("\n")
                        .map((line) => line.trim())
                        .filter((line) => line.length > 0);
                      setResponderFieldsConfig(newFields);
                    }}
                    placeholder="Option 1&#10;Option 2&#10;Option 3"
                    disabled={loading}
                  />
                </div>
              )}

              <div className="flex items-center gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id={`field-${index}-required`}
                    checked={field.required}
                    onCheckedChange={(checked) => {
                      const newFields = [...responderFieldsConfig];
                      newFields[index].required = checked === true;
                      setResponderFieldsConfig(newFields);
                    }}
                    disabled={loading}
                  />
                  <Label
                    htmlFor={`field-${index}-required`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    Required field
                  </Label>
                </div>

                {field.type !== "select" && (
                  <div className="flex-1 space-y-2">
                    <Label htmlFor={`field-${index}-placeholder`}>
                      Placeholder
                    </Label>
                    <Input
                      id={`field-${index}-placeholder`}
                      value={field.placeholder || ""}
                      onChange={(e) => {
                        const newFields = [...responderFieldsConfig];
                        newFields[index].placeholder = e.target.value;
                        setResponderFieldsConfig(newFields);
                      }}
                      placeholder="Optional placeholder text"
                      disabled={loading}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const newField: ResponderFieldConfig = {
                field: `field_${responderFieldsConfig.length + 1}`,
                type: "text",
                label: "",
                required: false,
              };
              setResponderFieldsConfig([...responderFieldsConfig, newField]);
            }}
            disabled={loading}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Field
          </Button>
        </div>
      )}

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
