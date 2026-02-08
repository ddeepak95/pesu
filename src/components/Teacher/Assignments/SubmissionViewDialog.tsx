"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  StudentSubmissionStatus,
  PublicSubmissionStatus,
  getSubmissionById,
} from "@/lib/queries/submissions";
import { Submission, QuestionEvaluations, SubmissionAttempt } from "@/types/submission";
import { Assignment } from "@/types/assignment";
import { getAssignmentByIdForTeacher } from "@/lib/queries/assignments";
import { useState, useEffect } from "react";
import { QuestionAttemptsCard } from "./QuestionAttemptsCard";
import { TranscriptDialog } from "./TranscriptDialog";
import { SubmissionDisplayName } from "./SubmissionDisplayName";

interface SubmissionViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentSubmission: StudentSubmissionStatus | PublicSubmissionStatus;
}

export default function SubmissionViewDialog({
  open,
  onOpenChange,
  studentSubmission,
}: SubmissionViewDialogProps) {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [fullSubmission, setFullSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false);
  const [selectedAttempt, setSelectedAttempt] = useState<SubmissionAttempt | null>(null);
  const [selectedQuestionOrder, setSelectedQuestionOrder] = useState<number | null>(null);

  // Get submission from either type (list view -- may not include evaluations JSONB)
  const submission = 'student' in studentSubmission 
    ? studentSubmission.submission 
    : studentSubmission.submission;

  useEffect(() => {
    if (open && submission) {
      const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
          // Fetch assignment and full submission (with evaluations JSONB) in parallel
          const [assignmentData, submissionData] = await Promise.all([
            getAssignmentByIdForTeacher(submission.assignment_id),
            getSubmissionById(submission.submission_id),
          ]);
          setAssignment(assignmentData);
          setFullSubmission(submissionData);
        } catch (err) {
          console.error("Error fetching submission details:", err);
          setError("Failed to load submission details");
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }
  }, [open, submission]);

  const handleViewTranscript = (attempt: SubmissionAttempt, questionOrder: number) => {
    setSelectedAttempt(attempt);
    setSelectedQuestionOrder(questionOrder);
    setTranscriptDialogOpen(true);
  };

  const getSubmissionEvaluations = (submission: Submission) => {
    if (!submission.evaluations) return {};

    // Check if it's the new format
    if (Array.isArray(submission.evaluations)) {
      // Legacy format - convert to new format structure for display
      return {};
    }

    // Handle both string and number keys (PostgreSQL JSONB may stringify keys)
    return submission.evaluations as { [key: number | string]: QuestionEvaluations };
  };

  if (!submission) {
    return null;
  }
  // Use the full submission (fetched with evaluations JSONB) for displaying attempts
  const evaluations = fullSubmission ? getSubmissionEvaluations(fullSubmission) : {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submission Details</DialogTitle>
          <DialogDescription>
            View submission for <SubmissionDisplayName submission={studentSubmission} />
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Loading submission details...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-destructive">{error}</p>
          </div>
        ) : (
          <div className="space-y-6 mt-4">
            {/* Attempts by Question */}
            {assignment && (
              <div className="space-y-6">
                {assignment.questions
                  .sort((a, b) => a.order - b.order)
                  .map((question) => {
                    // Handle both string and number keys (PostgreSQL JSONB may stringify keys)
                    const questionEvals = 
                      (evaluations[question.order] as QuestionEvaluations | undefined) ||
                      (evaluations[String(question.order)] as QuestionEvaluations | undefined);

                    return (
                      <QuestionAttemptsCard
                        key={question.order}
                        questionOrder={question.order}
                        questionPrompt={question.prompt}
                        questionAnswers={questionEvals}
                        onViewTranscript={handleViewTranscript}
                      />
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </DialogContent>

      {/* Transcript Dialog */}
      <TranscriptDialog
        open={transcriptDialogOpen}
        onOpenChange={setTranscriptDialogOpen}
        attempt={selectedAttempt}
        questionOrder={selectedQuestionOrder}
        submissionId={submission?.submission_id}
      />
    </Dialog>
  );
}

