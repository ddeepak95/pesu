"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getSubmissionsByAssignmentWithStudents,
  getPublicSubmissionsByAssignment,
  StudentSubmissionStatus,
  PublicSubmissionStatus,
  markAttemptsAsStale,
} from "@/lib/queries/submissions";
import { getClassByClassId } from "@/lib/queries/classes";
import SubmissionViewDialog from "./SubmissionViewDialog";
import { getStudentDisplayName } from "@/lib/utils/displayName";

interface SubmissionsTabProps {
  assignmentId: string;
  classId: string;
  isPublic: boolean;
}

export default function SubmissionsTab({
  assignmentId,
  classId,
  isPublic,
}: SubmissionsTabProps) {
  // Class students state
  const [classSubmissions, setClassSubmissions] = useState<StudentSubmissionStatus[]>([]);
  const [classLoading, setClassLoading] = useState(true);
  const [classError, setClassError] = useState<string | null>(null);

  // Public submissions state
  const [publicSubmissions, setPublicSubmissions] = useState<PublicSubmissionStatus[]>([]);
  const [publicLoading, setPublicLoading] = useState(true);
  const [publicError, setPublicError] = useState<string | null>(null);

  // Shared state for dialog
  const [selectedSubmission, setSelectedSubmission] =
    useState<StudentSubmissionStatus | PublicSubmissionStatus | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);

  // Fetch class student submissions
  useEffect(() => {
    const fetchClassSubmissions = async () => {
      setClassLoading(true);
      setClassError(null);
      try {
        // Convert class_id to database ID
        const classData = await getClassByClassId(classId);
        if (!classData) {
          setClassError("Class not found");
          return;
        }

        const data = await getSubmissionsByAssignmentWithStudents(
          assignmentId,
          classData.id // Use database ID
        );
        setClassSubmissions(data);
      } catch (err) {
        console.error("Error fetching class submissions:", err);
        setClassError("Failed to load submissions.");
      } finally {
        setClassLoading(false);
      }
    };

    fetchClassSubmissions();
  }, [assignmentId, classId]);

  // Fetch public submissions (only if assignment is public)
  useEffect(() => {
    if (!isPublic) {
      setPublicLoading(false);
      return;
    }

    const fetchPublicSubmissions = async () => {
      setPublicLoading(true);
      setPublicError(null);
      try {
        const data = await getPublicSubmissionsByAssignment(assignmentId);
        setPublicSubmissions(data);
      } catch (err) {
        console.error("Error fetching public submissions:", err);
        setPublicError("Failed to load public submissions.");
      } finally {
        setPublicLoading(false);
      }
    };

    fetchPublicSubmissions();
  }, [assignmentId, isPublic]);

  const handleViewSubmission = (item: StudentSubmissionStatus | PublicSubmissionStatus) => {
    setSelectedSubmission(item);
    setViewDialogOpen(true);
  };

  const handleResetAttempts = async (item: StudentSubmissionStatus | PublicSubmissionStatus) => {
    if (!item.submission) return;

    const displayName = 'student' in item 
      ? getStudentName(item.student)
      : getPublicResponderDisplayName(item.submission);

    const confirmed = window.confirm(
      `Are you sure you want to reset attempts for ${displayName}? This will mark all their attempts as stale, allowing them to start fresh while preserving history.`
    );

    if (!confirmed) return;

    setResetting(item.submission.submission_id);
    try {
      await markAttemptsAsStale(item.submission.submission_id);
      
      // Refresh the appropriate submissions list
      if ('student' in item) {
        // Refresh class submissions
        const classData = await getClassByClassId(classId);
        if (!classData) {
          alert("Class not found");
          return;
        }
        const data = await getSubmissionsByAssignmentWithStudents(
          assignmentId,
          classData.id // Use database ID
        );
        setClassSubmissions(data);
      } else {
        // Refresh public submissions
        const data = await getPublicSubmissionsByAssignment(assignmentId);
        setPublicSubmissions(data);
      }
    } catch (err) {
      console.error("Error resetting attempts:", err);
      alert("Failed to reset attempts. Please try again.");
    } finally {
      setResetting(null);
    }
  };

  const getStudentName = (student: StudentSubmissionStatus["student"]) => {
    return getStudentDisplayName(student);
  };

  const getPublicResponderDisplayName = (submission: PublicSubmissionStatus["submission"]) => {
    if (submission.responder_details) {
      return (
        submission.responder_details.name ||
        submission.responder_details.email ||
        submission.student_name ||
        submission.submission_id.substring(0, 8) + "..."
      );
    }
    return submission.student_name || submission.submission_id.substring(0, 8) + "...";
  };

  const getStatusBadge = (status: "completed" | "started" | "not_started") => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";
    switch (status) {
      case "completed":
        return (
          <span className={`${baseClasses} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`}>
            Completed
          </span>
        );
      case "started":
        return (
          <span className={`${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`}>
            Started
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

  const renderClassStudentsTable = () => {
    if (classSubmissions.length === 0) {
      return (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No students enrolled in this class yet.</p>
        </div>
      );
    }

    return (
      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-4 font-medium text-sm">Name</th>
              <th className="text-left p-4 font-medium text-sm">Status</th>
              <th className="text-left p-4 font-medium text-sm">Score</th>
              <th className="text-left p-4 font-medium text-sm">Attempts</th>
              <th className="text-right p-4 font-medium text-sm">Actions</th>
            </tr>
          </thead>
          <tbody>
            {classSubmissions.map((item) => {
              const displayName = getStudentName(item.student);
              const scoreDisplay = item.highestScore !== undefined && item.maxScore !== undefined
                ? `${item.highestScore}/${item.maxScore}`
                : "-";

              return (
                <tr key={item.student.student_id} className="border-b hover:bg-muted/30">
                  <td className="p-4">
                    <div className="text-sm font-medium truncate max-w-[200px]">
                      {displayName}
                    </div>
                  </td>
                  <td className="p-4">
                    {getStatusBadge(item.status)}
                  </td>
                  <td className="p-4">
                    <div className="text-sm">
                      {scoreDisplay}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm">
                      {item.totalAttempts}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      {item.submission && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewSubmission(item)}
                          >
                            View
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
                                : "Reset"}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderPublicSubmissionsTable = () => {
    if (publicSubmissions.length === 0) {
      return (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No public submissions yet.</p>
        </div>
      );
    }

    return (
      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-4 font-medium text-sm">Name</th>
              <th className="text-left p-4 font-medium text-sm">Status</th>
              <th className="text-left p-4 font-medium text-sm">Score</th>
              <th className="text-left p-4 font-medium text-sm">Attempts</th>
              <th className="text-right p-4 font-medium text-sm">Actions</th>
            </tr>
          </thead>
          <tbody>
            {publicSubmissions.map((item) => {
              const displayName = getPublicResponderDisplayName(item.submission);
              const scoreDisplay = item.highestScore !== undefined && item.maxScore !== undefined
                ? `${item.highestScore}/${item.maxScore}`
                : "-";

              return (
                <tr key={item.submission.submission_id} className="border-b hover:bg-muted/30">
                  <td className="p-4">
                    <div className="text-sm font-medium truncate max-w-[200px]">
                      {displayName}
                    </div>
                  </td>
                  <td className="p-4">
                    {getStatusBadge(item.status)}
                  </td>
                  <td className="p-4">
                    <div className="text-sm">
                      {scoreDisplay}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm">
                      {item.totalAttempts}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewSubmission(item)}
                      >
                        View
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
                            : "Reset"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="py-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Submissions</h2>
        <p className="text-sm text-muted-foreground">
          View and manage student submissions for this assignment.
        </p>
      </div>

      <Tabs defaultValue="class-students" className="w-full">
        <TabsList>
          <TabsTrigger value="class-students">Class Students</TabsTrigger>
          {isPublic && (
            <TabsTrigger value="public-submissions">Public Submissions</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="class-students" className="mt-6">
          {classLoading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Loading submissions...</p>
            </div>
          ) : classError ? (
            <div className="text-center py-12">
              <p className="text-destructive">{classError}</p>
            </div>
          ) : (
            renderClassStudentsTable()
          )}
        </TabsContent>

        {isPublic && (
          <TabsContent value="public-submissions" className="mt-6">
            {publicLoading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Loading public submissions...</p>
              </div>
            ) : publicError ? (
              <div className="text-center py-12">
                <p className="text-destructive">{publicError}</p>
              </div>
            ) : (
              renderPublicSubmissionsTable()
            )}
          </TabsContent>
        )}
      </Tabs>

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

