"use client";

import { useEffect, useState } from "react";
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
import {
  createSubmission,
  completeSubmission,
  getSubmissionById,
} from "@/lib/queries/submissions";
import { Assignment } from "@/types/assignment";
import {
  SubmissionAnswer,
  SubmissionAttempt,
  QuestionAnswers,
} from "@/types/submission";
import { supportedLanguages } from "@/utils/supportedLanguages";
import { VoiceAssessment } from "@/components/VoiceAssessment";
import { ChatAssessment } from "@/components/ChatAssessment";
import {
  saveSession,
  loadSession,
  clearSession,
  updateQuestionIndex,
  getSubmissionIdFromUrl,
  updateUrlWithSubmissionId,
} from "@/utils/sessionStorage";

type Phase = "info" | "answering" | "completed";

interface AssignmentResponseProps {
  assignmentData: Assignment;
  assignmentId: string;
  // For authenticated students, provide user info
  authenticatedUser?: {
    name: string;
    email?: string;
  };
  // If true, skip the info phase and auto-start
  autoStart?: boolean;
  // Callback when assignment is completed
  onComplete?: () => void;
  // Custom back button handler
  onBack?: () => void;
  // Callback when student name is set (for PageLayout userName)
  onStudentNameChange?: (name: string) => void;
}

/**
 * @deprecated This component is deprecated. Use PublicAssignmentResponse or StudentAssignmentResponse instead.
 *
 * Shared component for assignment response UI
 * Can be used by both public assignments and authenticated student portal
 */
export default function AssignmentResponse({
  assignmentData,
  assignmentId,
  authenticatedUser,
  autoStart = false,
  onComplete,
  onBack,
  onStudentNameChange,
}: AssignmentResponseProps) {
  const [phase, setPhase] = useState<Phase>("info");
  const [restoringSession, setRestoringSession] = useState(true);

  // Student info
  const [studentName, setStudentName] = useState(authenticatedUser?.name || "");
  const [preferredLanguage, setPreferredLanguage] = useState(
    assignmentData.preferred_language || ""
  );

  // Question answering
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{ [key: number]: string }>({});

  const handleBeginAssignmentWithValues = async (
    name: string,
    lang: string
  ) => {
    if (!name.trim()) {
      return;
    }

    if (!assignmentData) return;

    try {
      const submissionMode = assignmentData.assessment_mode ?? "voice";
      const submission = await createSubmission(
        assignmentData.assignment_id,
        lang, // preferredLanguage
        submissionMode,
        {
          responderDetails: { name: name.trim() },
        }
      );
      setSubmissionId(submission.submission_id);
      setStudentName(name.trim());
      setPreferredLanguage(lang);
      setPhase("answering");
      if (onStudentNameChange) {
        onStudentNameChange(name.trim());
      }

      // Save session to localStorage
      saveSession(assignmentId, {
        submissionId: submission.submission_id,
        studentName: name.trim(),
        preferredLanguage: lang,
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

  // Restore session after assignment is loaded
  useEffect(() => {
    if (assignmentData && restoringSession) {
      restoreSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentData, restoringSession]);

  // Auto-start if authenticated user and autoStart is true
  useEffect(() => {
    if (
      autoStart &&
      authenticatedUser &&
      assignmentData &&
      !restoringSession &&
      phase === "info" &&
      !submissionId
    ) {
      // Use authenticated user's name and assignment's preferred language
      const nameToUse = authenticatedUser.name || "";
      const langToUse = assignmentData.preferred_language || "";

      if (nameToUse) {
        // Set state first, then start assignment
        setStudentName(nameToUse);
        setPreferredLanguage(langToUse);
        // Start assignment immediately with the values
        handleBeginAssignmentWithValues(nameToUse, langToUse);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoStart,
    authenticatedUser,
    assignmentData,
    restoringSession,
    phase,
    submissionId,
  ]);

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
        setStudentName(submission.student_name || "");
        setPreferredLanguage(submission.preferred_language);
        if (onStudentNameChange) {
          onStudentNameChange(submission.student_name || "");
        }
        setPhase("completed");
        setRestoringSession(false);
        return;
      }

      // Restore in-progress submission
      setSubmissionId(submission.submission_id);
      setStudentName(submission.student_name || "");
      setPreferredLanguage(submission.preferred_language);
      if (onStudentNameChange) {
        onStudentNameChange(submission.student_name || "");
      }

      // Reconstruct answers from submission data (supports both formats)
      const reconstructedAnswers: { [key: number]: string } = {};
      const submissionAnswers = submission.answers as
        | SubmissionAnswer[]
        | { [key: number]: QuestionAnswers };

      if (Array.isArray(submissionAnswers)) {
        submissionAnswers.forEach((answer) => {
          reconstructedAnswers[answer.question_order] = answer.answer_text;
        });
      } else if (submissionAnswers && typeof submissionAnswers === "object") {
        Object.entries(submissionAnswers).forEach(
          ([questionOrderKey, questionValue]) => {
            const questionOrder = Number(questionOrderKey);
            if (Number.isNaN(questionOrder)) return;

            const questionAnswers = questionValue as QuestionAnswers;
            if (!questionAnswers.attempts?.length) return;

            let selectedAttempt: SubmissionAttempt | undefined;

            if (questionAnswers.selected_attempt) {
              selectedAttempt = questionAnswers.attempts.find(
                (attempt) =>
                  attempt.attempt_number === questionAnswers.selected_attempt
              );
            }

            if (!selectedAttempt) {
              selectedAttempt =
                questionAnswers.attempts[questionAnswers.attempts.length - 1];
            }

            if (selectedAttempt) {
              reconstructedAnswers[questionOrder] =
                selectedAttempt.answer_text || "";
            }
          }
        );
      }
      setAnswers(reconstructedAnswers);

      // Determine current question index
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
        studentName: submission.student_name || undefined,
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

    await handleBeginAssignmentWithValues(
      studentName.trim(),
      preferredLanguage
    );
  };

  const handleAnswerSave = async (transcript: string) => {
    if (!assignmentData || !submissionId) return;

    const currentQuestion = assignmentData.questions[currentQuestionIndex];

    // Update local state
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.order]: transcript,
    }));

    // Update current question index in localStorage
    updateQuestionIndex(assignmentId, currentQuestionIndex);
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      const newIndex = currentQuestionIndex - 1;
      setCurrentQuestionIndex(newIndex);
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
      updateQuestionIndex(assignmentId, newIndex);
    }
  };

  const handleSubmit = async () => {
    if (!submissionId) return;

    try {
      await completeSubmission(submissionId);
      setPhase("completed");
      clearSession(assignmentId);
      if (onComplete) {
        onComplete();
      }
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

  if (restoringSession) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Restoring your session...</p>
      </div>
    );
  }

  // Phase 1: Student Info Form (skip if authenticated user with autoStart)
  if (phase === "info") {
    return (
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
                disabled={!!authenticatedUser}
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
    );
  }

  // Phase 2: Question Answering
  if (phase === "answering") {
    // Wait for submission to be created
    if (!submissionId) {
      return (
        <div className="w-full space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">{assignmentData.title}</h1>
          </div>
          <div className="flex items-center justify-center min-h-[40vh]">
            <p className="text-muted-foreground">Starting assignment...</p>
          </div>
        </div>
      );
    }

    const sortedQuestions = [...assignmentData.questions].sort(
      (a, b) => a.order - b.order
    );
    const currentQuestion = sortedQuestions[currentQuestionIndex];
    const isLastQuestion = currentQuestionIndex === sortedQuestions.length - 1;

    const assessmentMode = assignmentData.assessment_mode ?? "voice";

    return (
      <div className="w-full space-y-6">
        {/* Assignment Title and Language Selector */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">{assignmentData.title}</h1>
        </div>

        {/* Assessment Component based on mode */}
        {assessmentMode === "voice" && (
          <VoiceAssessment
            key={currentQuestion.order}
            question={currentQuestion}
            language={preferredLanguage}
            assignmentId={assignmentData.assignment_id}
            submissionId={submissionId}
            questionNumber={currentQuestionIndex + 1}
            totalQuestions={sortedQuestions.length}
            onAnswerSave={handleAnswerSave}
            onPrevious={handlePrevious}
            onNext={handleNext}
            isFirstQuestion={currentQuestionIndex === 0}
            isLastQuestion={isLastQuestion}
            existingAnswer={answers[currentQuestion.order]}
            onLanguageChange={handleLanguageChange}
            botPromptConfig={assignmentData.bot_prompt_config}
          />
        )}
        {assessmentMode === "text_chat" && (
          <ChatAssessment
            key={currentQuestion.order}
            question={currentQuestion}
            language={preferredLanguage}
            assignmentId={assignmentData.assignment_id}
            submissionId={submissionId}
            questionNumber={currentQuestionIndex + 1}
            totalQuestions={sortedQuestions.length}
            onAnswerSave={handleAnswerSave}
            onPrevious={handlePrevious}
            onNext={handleNext}
            isFirstQuestion={currentQuestionIndex === 0}
            isLastQuestion={isLastQuestion}
            existingAnswer={answers[currentQuestion.order]}
            onLanguageChange={handleLanguageChange}
            botPromptConfig={assignmentData.bot_prompt_config}
          />
        )}
        {assessmentMode === "static_text" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Prompt</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{currentQuestion.prompt}</p>
              </CardContent>
            </Card>
            <p className="text-sm text-muted-foreground">
              Static text assessment is coming soon. Please contact your teacher
              if you expected an interactive question here.
            </p>
            <div className="flex justify-between gap-4">
              <Button
                onClick={handlePrevious}
                disabled={currentQuestionIndex === 0}
                variant="outline"
                size="lg"
              >
                Previous Question
              </Button>
              <div className="flex gap-4">
                {!isLastQuestion && (
                  <Button onClick={handleNext} size="lg">
                    Next Question
                  </Button>
                )}
                {isLastQuestion && (
                  <Button onClick={handleSubmit} size="lg" variant="default">
                    Submit Assignment
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Phase 3: Completion
  return (
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
          {onBack && (
            <Button onClick={onBack} variant="outline" className="w-full mt-4">
              Back to Class
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
