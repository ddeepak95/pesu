"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import List from "@/components/ui/List";
import {
  getSubmissionsByAssignmentWithStudents,
  StudentSubmissionStatus,
  markAttemptsAsStale,
} from "@/lib/queries/submissions";
import { getClassByClassId } from "@/lib/queries/classes";
import SubmissionViewDialog from "./SubmissionViewDialog";

interface SubmissionsTabProps {
  assignmentId: string;
  classId: string;
}

export default function SubmissionsTab({
  assignmentId,
  classId,
}: SubmissionsTabProps) {
  const [submissions, setSubmissions] = useState<StudentSubmissionStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSubmission, setSelectedSubmission] =
    useState<StudentSubmissionStatus | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);

  useEffect(() => {
    const fetchSubmissions = async () => {
      setLoading(true);
      setError(null);
      try {
        // Convert class_id to database ID
        const classData = await getClassByClassId(classId);
        if (!classData) {
          setError("Class not found");
          return;
        }

        const data = await getSubmissionsByAssignmentWithStudents(
          assignmentId,
          classData.id // Use database ID
        );
        setSubmissions(data);
      } catch (err) {
        console.error("Error fetching submissions:", err);
        setError("Failed to load submissions.");
      } finally {
        setLoading(false);
      }
    };

    fetchSubmissions();
  }, [assignmentId, classId]);

  const handleViewSubmission = (item: StudentSubmissionStatus) => {
    setSelectedSubmission(item);
    setViewDialogOpen(true);
  };

  const handleResetAttempts = async (item: StudentSubmissionStatus) => {
    if (!item.submission) return;

    const confirmed = window.confirm(
      `Are you sure you want to reset attempts for ${getStudentDisplayName(item.student)}? This will mark all their attempts as stale, allowing them to start fresh while preserving history.`
    );

    if (!confirmed) return;

    setResetting(item.submission.submission_id);
    try {
      await markAttemptsAsStale(item.submission.submission_id);
      // Refresh the submissions list
      const classData = await getClassByClassId(classId);
      if (!classData) {
        alert("Class not found");
        return;
      }
      const data = await getSubmissionsByAssignmentWithStudents(
        assignmentId,
        classData.id // Use database ID
      );
      setSubmissions(data);
    } catch (err) {
      console.error("Error resetting attempts:", err);
      alert("Failed to reset attempts. Please try again.");
    } finally {
      setResetting(null);
    }
  };

  const getStudentDisplayName = (student: StudentSubmissionStatus["student"]) => {
    return (
      student.student_display_name ||
      student.student_email ||
      student.student_id.substring(0, 8) + "..."
    );
  };

  const getStatusBadge = (status: StudentSubmissionStatus["status"]) => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";
    switch (status) {
      case "completed":
        return (
          <span className={`${baseClasses} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`}>
            Completed
          </span>
        );
      case "in_progress":
        return (
          <span className={`${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`}>
            In Progress
          </span>
        );
      case "not_started":
        return (
          <span className={`${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200`}>
            Not Started
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Loading submissions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Submissions</h2>
        <p className="text-sm text-muted-foreground">
          View and manage student submissions for this assignment.
        </p>
      </div>

      <List
        items={submissions}
        emptyMessage="No students enrolled in this class yet."
        renderItem={(item) => {
          const displayName = getStudentDisplayName(item.student);

          return (
            <div className="flex items-center justify-between rounded-md border p-4 gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="text-sm font-medium truncate">
                    {displayName}
                  </div>
                  {getStatusBadge(item.status)}
                </div>
                {item.student.student_email && item.student.student_display_name && (
                  <div className="text-xs text-muted-foreground truncate">
                    {item.student.student_email}
                  </div>
                )}
                {item.submission && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Submitted:{" "}
                    {item.submission.submitted_at
                      ? new Date(item.submission.submitted_at).toLocaleString()
                      : "Not submitted"}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {item.submission && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewSubmission(item)}
                    >
                      View Submission
                    </Button>
                    {item.hasAttempts && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResetAttempts(item)}
                        disabled={resetting === item.submission?.submission_id}
                      >
                        {resetting === item.submission?.submission_id
                          ? "Resetting..."
                          : "Reset Attempts"}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        }}
      />

      {selectedSubmission && (
        <SubmissionViewDialog
          open={viewDialogOpen}
          onOpenChange={setViewDialogOpen}
          studentSubmission={selectedSubmission}
        />
      )}
    </div>
  );
}

