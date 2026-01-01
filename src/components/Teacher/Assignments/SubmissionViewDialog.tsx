"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StudentSubmissionStatus } from "@/lib/queries/submissions";
import { Submission, QuestionAnswers } from "@/types/submission";
import { Assignment } from "@/types/assignment";
import { getAssignmentByIdForTeacher } from "@/lib/queries/assignments";
import { useState, useEffect } from "react";
import { AttemptsPanel } from "@/components/Shared/AttemptsPanel";
import QuestionView from "@/components/Shared/QuestionView";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SubmissionViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentSubmission: StudentSubmissionStatus;
}

export default function SubmissionViewDialog({
  open,
  onOpenChange,
  studentSubmission,
}: SubmissionViewDialogProps) {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && studentSubmission.submission) {
      const fetchAssignment = async () => {
        setLoading(true);
        setError(null);
        try {
          const data = await getAssignmentByIdForTeacher(
            studentSubmission.submission!.assignment_id
          );
          setAssignment(data);
        } catch (err) {
          console.error("Error fetching assignment:", err);
          setError("Failed to load assignment details");
        } finally {
          setLoading(false);
        }
      };

      fetchAssignment();
    }
  }, [open, studentSubmission.submission]);

  const getStudentDisplayName = () => {
    const student = studentSubmission.student;
    return (
      student.student_display_name ||
      student.student_email ||
      student.student_id.substring(0, 8) + "..."
    );
  };

  const getSubmissionAnswers = (submission: Submission) => {
    if (!submission.answers) return {};

    // Check if it's the new format
    if (Array.isArray(submission.answers)) {
      // Legacy format - convert to new format structure for display
      return {};
    }

    // Handle both string and number keys (PostgreSQL JSONB may stringify keys)
    return submission.answers as { [key: number | string]: QuestionAnswers };
  };

  if (!studentSubmission.submission) {
    return null;
  }

  const submission = studentSubmission.submission;
  const answers = getSubmissionAnswers(submission);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submission Details</DialogTitle>
          <DialogDescription>
            View submission for {getStudentDisplayName()}
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
            {/* Submission Metadata */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Submission Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <span className="text-sm font-medium capitalize">
                    {submission.status}
                  </span>
                </div>
                {submission.submitted_at && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Submitted:
                    </span>
                    <span className="text-sm">
                      {new Date(submission.submitted_at).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Created:</span>
                  <span className="text-sm">
                    {submission.created_at
                      ? new Date(submission.created_at).toLocaleString()
                      : "N/A"}
                  </span>
                </div>
                {submission.submission_mode && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Mode:</span>
                    <span className="text-sm font-medium capitalize">
                      {submission.submission_mode === "text_chat"
                        ? "Text Chat"
                        : submission.submission_mode === "static_text"
                        ? "Static Text"
                        : "Voice"}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Questions and Attempts */}
            {assignment && (
              <div className="space-y-6">
                {assignment.questions
                  .sort((a, b) => a.order - b.order)
                  .map((question, index) => {
                    // Handle both string and number keys (PostgreSQL JSONB may stringify keys)
                    const questionAnswers = 
                      (answers[question.order] as QuestionAnswers | undefined) ||
                      (answers[String(question.order)] as QuestionAnswers | undefined);
                    const attempts = questionAnswers?.attempts || [];

                    return (
                      <div key={question.order} className="space-y-4">
                        <QuestionView
                          question={question}
                          index={index}
                          showRubric={true}
                          showSupportingContent={true}
                        />
                        {attempts.length > 0 ? (
                          <AttemptsPanel
                            attempts={attempts}
                            maxAttempts={assignment.max_attempts}
                          />
                        ) : (
                          <Card>
                            <CardContent className="py-4">
                              <p className="text-sm text-muted-foreground text-center">
                                No attempts for this question yet.
                              </p>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

