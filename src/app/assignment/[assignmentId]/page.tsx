"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { getAssignmentById } from "@/lib/queries/assignments";
import {
  createSubmission,
  updateSubmissionAnswer,
  completeSubmission,
} from "@/lib/queries/submissions";
import { Assignment } from "@/types/assignment";
import { supportedLanguages } from "@/utils/supportedLanguages";

type Phase = "info" | "answering" | "completed";

export default function PublicAssignmentPage() {
  const params = useParams();
  const assignmentId = params.assignmentId as string;

  const [phase, setPhase] = useState<Phase>("info");
  const [assignmentData, setAssignmentData] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Student info
  const [studentName, setStudentName] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("");

  // Question answering
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<{ [key: number]: string }>({});
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (assignmentId) {
      fetchAssignment();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  const fetchAssignment = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getAssignmentById(assignmentId);
      if (!data) {
        // Since RLS blocks non-public assignments for anonymous users with same error as "not found",
        // we show a message that covers both cases
        setError(
          "Assignment not found or not publicly accessible. If you have a link from your teacher, please ensure the assignment is set as public."
        );
      } else if (!data.is_public) {
        // This case only applies to authenticated users who can see non-public assignments
        setError(
          "This assignment is not publicly accessible. Please contact your teacher for access."
        );
      } else {
        setAssignmentData(data);
        setPreferredLanguage(data.preferred_language);
      }
    } catch (err) {
      console.error("Error fetching assignment:", err);
      setError("Failed to load assignment details");
    } finally {
      setLoading(false);
    }
  };

  const handleBeginAssignment = async () => {
    if (!studentName.trim()) {
      alert("Please enter your name");
      return;
    }

    if (!assignmentData) return;

    try {
      const submission = await createSubmission(
        assignmentData.assignment_id,
        studentName.trim(),
        preferredLanguage
      );
      setSubmissionId(submission.submission_id);
      setPhase("answering");
    } catch (err) {
      console.error("Error creating submission:", err);
      alert("Failed to start assignment. Please try again.");
    }
  };

  const handleAnswerChange = (questionOrder: number, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionOrder]: value,
    }));
  };

  const handleNextQuestion = async () => {
    if (!assignmentData || !submissionId) return;

    const currentQuestion = assignmentData.questions[currentQuestionIndex];
    const currentAnswer = answers[currentQuestion.order] || "";

    // Save the current answer
    try {
      await updateSubmissionAnswer(
        submissionId,
        currentQuestion.order,
        currentAnswer
      );
    } catch (err) {
      console.error("Error saving answer:", err);
      alert("Failed to save answer. Please try again.");
      return;
    }

    // Move to next question
    if (currentQuestionIndex < assignmentData.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handleSubmitAssignment = async () => {
    if (!assignmentData || !submissionId) return;

    setSubmitting(true);

    try {
      // Save the last answer
      const currentQuestion = assignmentData.questions[currentQuestionIndex];
      const currentAnswer = answers[currentQuestion.order] || "";

      await updateSubmissionAnswer(
        submissionId,
        currentQuestion.order,
        currentAnswer
      );

      // Mark submission as completed
      await completeSubmission(submissionId);
      setPhase("completed");
    } catch (err) {
      console.error("Error submitting assignment:", err);
      alert("Failed to submit assignment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Loading assignment...</p>
        </div>
      </PageLayout>
    );
  }

  if (error || !assignmentData) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-destructive">{error || "Assignment not found"}</p>
        </div>
      </PageLayout>
    );
  }

  // Phase 1: Student Info Form
  if (phase === "info") {
    return (
      <PageLayout>
        <div className="flex items-center justify-center min-h-[60vh] p-8">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-center text-2xl">
                {assignmentData.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="studentName">Your Name</Label>
                <Input
                  id="studentName"
                  type="text"
                  placeholder="Enter your name"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">Preferred Language</Label>
                <Select
                  value={preferredLanguage}
                  onValueChange={setPreferredLanguage}
                >
                  <SelectTrigger id="language">
                    <SelectValue placeholder="Select language" />
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

              <Button
                className="w-full"
                onClick={handleBeginAssignment}
                disabled={!studentName.trim()}
              >
                Begin Assignment
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  // Phase 2: Question Answering
  if (phase === "answering") {
    const sortedQuestions = [...assignmentData.questions].sort(
      (a, b) => a.order - b.order
    );
    const currentQuestion = sortedQuestions[currentQuestionIndex];
    const isLastQuestion = currentQuestionIndex === sortedQuestions.length - 1;

    return (
      <PageLayout userName={studentName}>
        <div className="p-8">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Assignment Title and Language */}
            <div>
              <h1 className="text-3xl font-bold">{assignmentData.title}</h1>
              <div className="flex items-center gap-4 mt-2 text-muted-foreground">
                <p>
                  Language:{" "}
                  {supportedLanguages.find(
                    (lang) => lang.code === preferredLanguage
                  )?.name || preferredLanguage}
                </p>
              </div>
            </div>

            {/* Question Number */}
            <p className="text-lg font-medium">
              Question ({currentQuestionIndex + 1}/{sortedQuestions.length})
            </p>

            {/* Question Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Prompt</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="whitespace-pre-wrap">{currentQuestion.prompt}</p>

                {/* View Rubric Accordion */}
                {currentQuestion.rubric &&
                  currentQuestion.rubric.length > 0 && (
                    <Accordion type="single" collapsible>
                      <AccordionItem value="rubric">
                        <AccordionTrigger>View Rubric</AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2">
                            {currentQuestion.rubric.map((item, idx) => (
                              <div
                                key={idx}
                                className="flex justify-between items-start gap-4 p-3 bg-muted/50 rounded-md"
                              >
                                <span className="flex-1">{item.item}</span>
                                <span className="font-semibold text-sm whitespace-nowrap">
                                  {item.points} pts
                                </span>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}

                {/* Answer Textarea */}
                <div className="space-y-2">
                  <Label htmlFor="answer">Your Answer</Label>
                  <Textarea
                    id="answer"
                    placeholder="Your answer will go here (voice feature coming soon)"
                    value={answers[currentQuestion.order] || ""}
                    onChange={(e) =>
                      handleAnswerChange(currentQuestion.order, e.target.value)
                    }
                    rows={8}
                    className="resize-none"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Navigation Buttons */}
            <div className="flex justify-end">
              {isLastQuestion ? (
                <Button
                  onClick={handleSubmitAssignment}
                  disabled={submitting}
                  size="lg"
                >
                  {submitting ? "Submitting..." : "Submit Assignment"}
                </Button>
              ) : (
                <Button onClick={handleNextQuestion} size="lg">
                  Next Question
                </Button>
              )}
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  // Phase 3: Completion
  return (
    <PageLayout userName={studentName}>
      <div className="flex items-center justify-center min-h-[60vh] p-8">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-2xl">Thank You!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Your assignment has been submitted successfully.
            </p>
            <p className="text-sm text-muted-foreground">
              Your teacher will review your responses and provide feedback.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
