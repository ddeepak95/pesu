"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAssignmentById } from "@/lib/queries/assignments";
import {
  createSubmission,
  updateSubmissionAnswer,
  completeSubmission,
} from "@/lib/queries/submissions";
import { Assignment } from "@/types/assignment";
import { supportedLanguages } from "@/utils/supportedLanguages";
import { VoiceAssessment } from "@/components/VoiceAssessment";

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
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{ [key: number]: string }>({});

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

  const handleAnswerSave = async (transcript: string) => {
    if (!assignmentData || !submissionId) return;

    const currentQuestion = assignmentData.questions[currentQuestionIndex];

    // Update local state
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.order]: transcript,
    }));

    try {
      // Save the answer (transcript) to database
      await updateSubmissionAnswer(
        submissionId,
        currentQuestion.order,
        transcript
      );
    } catch (err) {
      console.error("Error saving answer:", err);
      alert("Failed to save answer. Please try again.");
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleNext = () => {
    if (
      assignmentData &&
      currentQuestionIndex < assignmentData.questions.length - 1
    ) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handleSubmit = async () => {
    if (!submissionId) return;

    try {
      await completeSubmission(submissionId);
      setPhase("completed");
    } catch (err) {
      console.error("Error submitting assignment:", err);
      alert("Failed to submit assignment. Please try again.");
    }
  };

  const handleLanguageChange = (newLanguage: string) => {
    setPreferredLanguage(newLanguage);
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
            {/* Assignment Title and Language Selector */}
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-bold">{assignmentData.title}</h1>
            </div>

            {/* Voice Assessment Component */}
            <VoiceAssessment
              question={currentQuestion}
              language={preferredLanguage}
              assignmentId={assignmentData.assignment_id}
              questionNumber={currentQuestionIndex + 1}
              totalQuestions={sortedQuestions.length}
              onAnswerSave={handleAnswerSave}
              onPrevious={handlePrevious}
              onNext={handleNext}
              onSubmit={handleSubmit}
              isFirstQuestion={currentQuestionIndex === 0}
              isLastQuestion={isLastQuestion}
              existingAnswer={answers[currentQuestion.order]}
              onLanguageChange={handleLanguageChange}
            />
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
