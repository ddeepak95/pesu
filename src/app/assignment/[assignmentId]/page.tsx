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
  getSubmissionById,
} from "@/lib/queries/submissions";
import { Assignment } from "@/types/assignment";
import { supportedLanguages } from "@/utils/supportedLanguages";
import { VoiceAssessment } from "@/components/VoiceAssessment";
import {
  saveSession,
  loadSession,
  clearSession,
  updateQuestionIndex,
  getSubmissionIdFromUrl,
  updateUrlWithSubmissionId,
} from "@/utils/sessionStorage";

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
  const [restoringSession, setRestoringSession] = useState(true);

  // First useEffect: Fetch assignment data
  useEffect(() => {
    if (assignmentId) {
      fetchAssignment();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  // Second useEffect: Restore session after assignment is loaded
  useEffect(() => {
    if (assignmentData && restoringSession) {
      restoreSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentData, restoringSession]);

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

  const restoreSession = async () => {
    try {
      // First, check URL for submission ID
      const urlSubmissionId = getSubmissionIdFromUrl();

      // Then check localStorage
      const localSession = loadSession(assignmentId);

      // Prefer URL parameter over localStorage
      const sessionSubmissionId = urlSubmissionId || localSession?.submissionId;

      if (!sessionSubmissionId) {
        // No session to restore
        setRestoringSession(false);
        return;
      }

      // Fetch the submission from database
      const submission = await getSubmissionById(sessionSubmissionId);

      if (!submission || submission.assignment_id !== assignmentId) {
        // Invalid or mismatched submission
        console.warn("Invalid submission ID, clearing session");
        clearSession(assignmentId);
        setRestoringSession(false);
        return;
      }

      if (submission.status === "completed") {
        // Submission is completed, show completion screen
        setSubmissionId(submission.submission_id);
        setStudentName(submission.student_name);
        setPreferredLanguage(submission.preferred_language);
        setPhase("completed");
        setRestoringSession(false);
        return;
      }

      // Restore in-progress submission
      setSubmissionId(submission.submission_id);
      setStudentName(submission.student_name);
      setPreferredLanguage(submission.preferred_language);

      // Reconstruct answers from submission data
      const reconstructedAnswers: { [key: number]: string } = {};
      submission.answers.forEach((answer) => {
        reconstructedAnswers[answer.question_order] = answer.answer_text;
      });
      setAnswers(reconstructedAnswers);

      // Determine current question index
      // If we have a saved index in localStorage, use it
      // Otherwise, find the first unanswered question
      let questionIndex = localSession?.currentQuestionIndex ?? 0;

      // Validate the index is within bounds
      if (
        !assignmentData?.questions ||
        questionIndex >= assignmentData.questions.length
      ) {
        questionIndex = 0;
      }

      setCurrentQuestionIndex(questionIndex);
      setPhase("answering");

      // Ensure URL has the submission ID
      if (!urlSubmissionId) {
        updateUrlWithSubmissionId(assignmentId, submission.submission_id);
      }

      // Save/update localStorage
      saveSession(assignmentId, {
        submissionId: submission.submission_id,
        studentName: submission.student_name,
        preferredLanguage: submission.preferred_language,
        currentQuestionIndex: questionIndex,
        phase: "answering",
      });
    } catch (err) {
      console.error("Error restoring session:", err);
      clearSession(assignmentId);
    } finally {
      setRestoringSession(false);
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

      // Save session to localStorage
      saveSession(assignmentId, {
        submissionId: submission.submission_id,
        studentName: studentName.trim(),
        preferredLanguage,
        currentQuestionIndex: 0,
        phase: "answering",
      });

      // Update URL with submission ID
      updateUrlWithSubmissionId(assignmentId, submission.submission_id);
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

      // Update current question index in localStorage
      updateQuestionIndex(assignmentId, currentQuestionIndex);
    } catch (err) {
      console.error("Error saving answer:", err);
      alert("Failed to save answer. Please try again.");
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      const newIndex = currentQuestionIndex - 1;
      setCurrentQuestionIndex(newIndex);
      // Update localStorage with new question index
      updateQuestionIndex(assignmentId, newIndex);
    }
  };

  const handleNext = () => {
    if (
      assignmentData &&
      currentQuestionIndex < assignmentData.questions.length - 1
    ) {
      const newIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(newIndex);
      // Update localStorage with new question index
      updateQuestionIndex(assignmentId, newIndex);
    }
  };

  const handleSubmit = async () => {
    if (!submissionId) return;

    try {
      await completeSubmission(submissionId);
      setPhase("completed");
      // Clear localStorage session since assignment is completed
      clearSession(assignmentId);
    } catch (err) {
      console.error("Error submitting assignment:", err);
      alert("Failed to submit assignment. Please try again.");
    }
  };

  const handleLanguageChange = (newLanguage: string) => {
    setPreferredLanguage(newLanguage);

    // Update language in localStorage session
    const session = loadSession(assignmentId);
    if (session) {
      saveSession(assignmentId, {
        ...session,
        preferredLanguage: newLanguage,
      });
    }
  };

  if (loading || restoringSession) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">
            {restoringSession
              ? "Restoring your session..."
              : "Loading assignment..."}
          </p>
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
