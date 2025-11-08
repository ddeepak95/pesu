"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import QuestionCard from "@/components/Teacher/Assignments/QuestionCard";
import { useAuth } from "@/contexts/AuthContext";
import { createAssignment } from "@/lib/queries/assignments";
import { Question, RubricItem } from "@/types/assignment";
import { getClassByClassId } from "@/lib/queries/classes";

export default function CreateAssignmentPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const classId = params.classId as string;

  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([
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
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classDbId, setClassDbId] = useState<string | null>(null);
  const [loadingClass, setLoadingClass] = useState(true);

  // Fetch the class to get the database ID
  useEffect(() => {
    const fetchClass = async () => {
      try {
        const classData = await getClassByClassId(classId);
        if (classData) {
          setClassDbId(classData.id);
        } else {
          setError("Class not found");
        }
      } catch (err) {
        console.error("Error fetching class:", err);
        setError("Failed to load class");
      } finally {
        setLoadingClass(false);
      }
    };

    if (classId) {
      fetchClass();
    }
  }, [classId]);

  const handleQuestionChange = (
    questionIndex: number,
    field: keyof Question,
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

  const handleRemoveRubricItem = (questionIndex: number, rubricIndex: number) => {
    const newQuestions = [...questions];
    if (newQuestions[questionIndex].rubric.length > 1) {
      newQuestions[questionIndex].rubric = newQuestions[questionIndex].rubric.filter(
        (_, i) => i !== rubricIndex
      );

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
        setError(`Question ${i + 1}: At least one valid rubric item is required`);
        return;
      }
    }

    if (!user) {
      setError("You must be logged in to create an assignment");
      return;
    }

    if (!classDbId) {
      setError("Class not found");
      return;
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

      await createAssignment(
        {
          class_id: classDbId,
          title: title.trim(),
          questions: cleanedQuestions,
          total_points: totalPoints,
        },
        user.id
      );

      // Navigate back to class page
      router.push(`/teacher/classes/${classId}`);
    } catch (err) {
      console.error("Error creating assignment:", err);
      setError("Failed to create assignment. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (loadingClass) {
    return (
      <PageLayout>
        <div className="p-8 text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </PageLayout>
    );
  }

  if (error && !classDbId) {
    return (
      <PageLayout>
        <div className="p-8 text-center">
          <p className="text-destructive">{error}</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto p-8">
        <h1 className="text-3xl font-bold mb-8">Create Learning Assignment</h1>

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
              {loading ? "Creating..." : "Create Assignment"}
            </Button>
          </div>
        </form>
      </div>
    </PageLayout>
  );
}

