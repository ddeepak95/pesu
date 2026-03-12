"use client";

import { useState, useEffect, useMemo } from "react";
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
import { getProgressViewConfig } from "@/lib/queries/classes";
import {
  getProfileFieldsForClass,
  getAllStudentProfiles,
} from "@/lib/queries/profileFields";
import {
  getTeacherUnlocksForContentItem,
  unlockContentForStudent,
  lockContentForStudent,
} from "@/lib/queries/teacherUnlocks";
import { getAssignmentByIdForTeacher } from "@/lib/queries/assignments";
import { getContentItemByRefId } from "@/lib/queries/contentItems";
import SubmissionViewDialog from "./SubmissionViewDialog";
import { getStudentDisplayName } from "@/lib/utils/displayName";
import SubmissionsTable, {
  SubmissionsTableColumn,
  SubmissionsTableRow,
} from "@/components/Teacher/Shared/SubmissionsTable";
import { ProfileField } from "@/types/profileFields";

interface SubmissionsTabProps {
  assignmentId: string;
  classId: string;
  isPublic: boolean;
  classGroupId?: string | null;
}

export default function SubmissionsTab({
  assignmentId,
  classId,
  isPublic,
  classGroupId,
}: SubmissionsTabProps) {
  // Class students state
  const [classSubmissions, setClassSubmissions] = useState<
    StudentSubmissionStatus[]
  >([]);
  const [classLoading, setClassLoading] = useState(true);
  const [classError, setClassError] = useState<string | null>(null);

  // Public submissions state
  const [publicSubmissions, setPublicSubmissions] = useState<
    PublicSubmissionStatus[]
  >([]);
  const [publicLoading, setPublicLoading] = useState(true);
  const [publicError, setPublicError] = useState<string | null>(null);

  // Shared state for dialog
  const [selectedSubmission, setSelectedSubmission] = useState<
    StudentSubmissionStatus | PublicSubmissionStatus | null
  >(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);

  // Profile + config state
  const [profileFields, setProfileFields] = useState<ProfileField[]>([]);
  const [studentProfilesMap, setStudentProfilesMap] = useState<
    Map<string, Record<string, string>>
  >(new Map());
  const [displayFieldIds, setDisplayFieldIds] = useState<Set<string>>(
    new Set()
  );
  const [filterFieldIds, setFilterFieldIds] = useState<Set<string>>(
    new Set()
  );

  // Teacher unlock state
  const [requireTeacherUnlock, setRequireTeacherUnlock] = useState(false);
  const [unlockedStudentIds, setUnlockedStudentIds] = useState<Set<string>>(
    new Set()
  );
  const [contentItemId, setContentItemId] = useState<string | null>(null);
  const [classDbId, setClassDbId] = useState<string | null>(null);
  const [totalQuestionCount, setTotalQuestionCount] = useState(0);

  // Fetch class student submissions
  useEffect(() => {
    const fetchClassSubmissions = async () => {
      setClassLoading(true);
      setClassError(null);
      try {
        const classData = await getClassByClassId(classId);
        if (!classData) {
          setClassError("Class not found");
          return;
        }
        setClassDbId(classData.id);

        // Fetch submissions, assignment, profile data, and config in parallel
        const [data, assignment, fields, profiles, savedConfig] =
          await Promise.all([
            getSubmissionsByAssignmentWithStudents(
              assignmentId,
              classData.id,
              classGroupId
            ),
            getAssignmentByIdForTeacher(assignmentId),
            getProfileFieldsForClass(classData.id),
            getAllStudentProfiles(classData.id),
            getProgressViewConfig(classData.id),
          ]);

        // content_items.ref_id is the assignment's UUID (id), not assignment_id (public short id)
        const contentItem = assignment
          ? await getContentItemByRefId(assignment.id, "formative_assignment")
          : null;

        setClassSubmissions(data);
        setProfileFields(fields);
        setTotalQuestionCount(assignment?.questions?.length ?? 0);

        // Build profile map
        const profilesMap = new Map<string, Record<string, string>>();
        profiles.forEach((p) => {
          profilesMap.set(p.student_id, p.field_responses);
        });
        setStudentProfilesMap(profilesMap);

        // Display fields and filter fields from config
        setDisplayFieldIds(
          new Set<string>(savedConfig?.display_fields ?? [])
        );
        setFilterFieldIds(
          new Set<string>(savedConfig?.filter_fields ?? [])
        );

        // Content item and teacher unlock
        if (contentItem) {
          setContentItemId(contentItem.id);
          setRequireTeacherUnlock(
            contentItem.require_teacher_unlock ?? false
          );

          if (contentItem.require_teacher_unlock) {
            const unlocks = await getTeacherUnlocksForContentItem(
              contentItem.id
            );
            setUnlockedStudentIds(
              new Set(unlocks.map((u) => u.student_id))
            );
          }
        }
      } catch (err) {
        console.error("Error fetching class submissions:", err);
        setClassError("Failed to load submissions.");
      } finally {
        setClassLoading(false);
      }
    };

    fetchClassSubmissions();
  }, [assignmentId, classId, classGroupId]);

  // Fetch public submissions and total question count (only if assignment is public)
  useEffect(() => {
    if (!isPublic) {
      setPublicLoading(false);
      return;
    }

    const fetchPublicSubmissions = async () => {
      setPublicLoading(true);
      setPublicError(null);
      try {
        const [data, assignment] = await Promise.all([
          getPublicSubmissionsByAssignment(assignmentId),
          getAssignmentByIdForTeacher(assignmentId),
        ]);
        setPublicSubmissions(data);
        setTotalQuestionCount(assignment?.questions?.length ?? 0);
      } catch (err) {
        console.error("Error fetching public submissions:", err);
        setPublicError("Failed to load public submissions.");
      } finally {
        setPublicLoading(false);
      }
    };

    fetchPublicSubmissions();
  }, [assignmentId, isPublic]);

  const handleViewSubmission = (
    item: StudentSubmissionStatus | PublicSubmissionStatus
  ) => {
    setSelectedSubmission(item);
    setViewDialogOpen(true);
  };

  const handleResetAttempts = async (
    item: StudentSubmissionStatus | PublicSubmissionStatus
  ) => {
    if (!item.submission) return;

    const displayName =
      "student" in item
        ? getStudentDisplayName(item.student)
        : getPublicResponderDisplayName(item.submission);

    const confirmed = window.confirm(
      `Are you sure you want to reset attempts for ${displayName}? This will mark all their attempts as stale, allowing them to start fresh while preserving history.`
    );

    if (!confirmed) return;

    setResetting(item.submission.submission_id);
    try {
      await markAttemptsAsStale(item.submission.submission_id);

      // Refresh the appropriate submissions list
      if ("student" in item) {
        const classData = await getClassByClassId(classId);
        if (!classData) {
          alert("Class not found");
          return;
        }
        const data = await getSubmissionsByAssignmentWithStudents(
          assignmentId,
          classData.id,
          classGroupId
        );
        setClassSubmissions(data);
      } else {
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

  const getPublicResponderDisplayName = (
    submission: PublicSubmissionStatus["submission"]
  ) => {
    if (submission.responder_details) {
      return (
        submission.responder_details.name ||
        submission.responder_details.email ||
        submission.submission_id.substring(0, 8) + "..."
      );
    }
    return submission.submission_id.substring(0, 8) + "...";
  };

  const getStatusBadge = (status: "completed" | "started" | "not_started") => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium";
    switch (status) {
      case "completed":
        return (
          <span
            className={`${baseClasses} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`}
          >
            Completed
          </span>
        );
      case "started":
        return (
          <span
            className={`${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`}
          >
            In Progress
          </span>
        );
      case "not_started":
        return (
          <span
            className={`${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200`}
          >
            Not Started
          </span>
        );
    }
  };

  // Handle unlock toggle
  const handleToggleUnlock = async (
    studentId: string,
    currentlyUnlocked: boolean
  ) => {
    if (!contentItemId) return;

    if (currentlyUnlocked) {
      await lockContentForStudent(contentItemId, studentId);
      setUnlockedStudentIds((prev) => {
        const next = new Set(prev);
        next.delete(studentId);
        return next;
      });
    } else {
      await unlockContentForStudent(contentItemId, studentId);
      setUnlockedStudentIds((prev) => {
        const next = new Set(prev);
        next.add(studentId);
        return next;
      });
    }
  };

  // Build class students table columns
  const classColumns: SubmissionsTableColumn[] = useMemo(() => {
    const cols: SubmissionsTableColumn[] = [
      {
        key: "status",
        label: "Status",
        render: (row) => (
          <div className="flex flex-wrap items-center gap-1.5">
            {getStatusBadge(row.data?.status as "completed" | "started" | "not_started")}
            {!!(row.data?.hasPendingApprovals) && (
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                Pending Approval
              </span>
            )}
          </div>
        ),
        sortValue: (row) => {
          const s = row.data?.status as string;
          return s === "completed" ? 0 : s === "started" ? 1 : 2;
        },
      },
      {
        key: "score",
        label: "Score",
        render: (row) => (
          <div className="text-sm">
            {row.data?.scoreDisplay as string}
          </div>
        ),
        sortValue: (row) => (row.data?.highestScore as number) ?? -1,
      },
      {
        key: "questions",
        label: "Questions",
        render: (row) => {
          const attempted = row.data?.questionsAttemptedCount as
            | number
            | undefined;
          const total = totalQuestionCount;
          const display =
            total > 0
              ? `${attempted ?? "—"}/${total}`
              : (attempted ?? "—").toString();
          return <div className="text-sm">{display}</div>;
        },
        sortValue: (row) =>
          (row.data?.questionsAttemptedCount as number) ?? -1,
      },
      {
        key: "actions",
        label: "Actions",
        align: "right",
        sortable: false,
        render: (row) => {
          const item = row.data?._original as StudentSubmissionStatus;
          if (!item) return null;
          return (
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
                      disabled={
                        resetting === item.submission?.submission_id
                      }
                    >
                      {resetting === item.submission?.submission_id
                        ? "Resetting..."
                        : "Reset"}
                    </Button>
                  )}
                </>
              )}
            </div>
          );
        },
      },
    ];
    return cols;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetting, totalQuestionCount]);

  // Build class students table rows
  const classRows: SubmissionsTableRow[] = useMemo(() => {
    return classSubmissions.map((item) => {
      const scoreDisplay =
        item.highestScore !== undefined && item.maxScore !== undefined
          ? `${item.highestScore}/${item.maxScore}`
          : "-";

      return {
        id: item.student.student_id,
        name: getStudentDisplayName(item.student),
        email: item.student.student_email,
        status: item.status,
        profileData: studentProfilesMap.get(item.student.student_id) ?? {},
        isUnlocked: unlockedStudentIds.has(item.student.student_id),
        data: {
          status: item.status,
          scoreDisplay,
          highestScore: item.highestScore,
          totalAttempts: item.totalAttempts,
          questionsAttemptedCount: item.questionsAttemptedCount,
          hasPendingApprovals: item.hasPendingApprovals,
          _original: item,
        },
      };
    });
  }, [classSubmissions, studentProfilesMap, unlockedStudentIds]);

  // Build public submissions table columns
  const publicColumns: SubmissionsTableColumn[] = useMemo(() => {
    return [
      {
        key: "status",
        label: "Status",
        render: (row) => (
          <div className="flex flex-wrap items-center gap-1.5">
            {getStatusBadge(row.data?.status as "completed" | "started" | "not_started")}
            {!!(row.data?.hasPendingApprovals) && (
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                Pending Approval
              </span>
            )}
          </div>
        ),
        sortValue: (row) =>
          (row.data?.status as string) === "completed" ? 0 : 1,
      },
      {
        key: "score",
        label: "Score",
        render: (row) => (
          <div className="text-sm">
            {row.data?.scoreDisplay as string}
          </div>
        ),
        sortValue: (row) => (row.data?.highestScore as number) ?? -1,
      },
      {
        key: "questions",
        label: "Questions",
        render: (row) => {
          const attempted = row.data?.questionsAttemptedCount as
            | number
            | undefined;
          const total = totalQuestionCount;
          const display =
            total > 0
              ? `${attempted ?? "—"}/${total}`
              : (attempted ?? "—").toString();
          return <div className="text-sm">{display}</div>;
        },
        sortValue: (row) =>
          (row.data?.questionsAttemptedCount as number) ?? -1,
      },
      {
        key: "actions",
        label: "Actions",
        align: "right",
        sortable: false,
        render: (row) => {
          const item = row.data?._original as PublicSubmissionStatus;
          if (!item) return null;
          return (
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
                  disabled={
                    resetting === item.submission?.submission_id
                  }
                >
                  {resetting === item.submission?.submission_id
                    ? "Resetting..."
                    : "Reset"}
                </Button>
              )}
            </div>
          );
        },
      },
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetting, totalQuestionCount]);

  // Build public submissions table rows
  const publicRows: SubmissionsTableRow[] = useMemo(() => {
    return publicSubmissions.map((item) => {
      const scoreDisplay =
        item.highestScore !== undefined && item.maxScore !== undefined
          ? `${item.highestScore}/${item.maxScore}`
          : "-";

      return {
        id: item.submission.submission_id,
        name: getPublicResponderDisplayName(item.submission),
        status: item.status,
        data: {
          status: item.status,
          scoreDisplay,
          highestScore: item.highestScore,
          totalAttempts: item.totalAttempts,
          questionsAttemptedCount: item.questionsAttemptedCount,
          hasPendingApprovals: item.hasPendingApprovals,
          _original: item,
        },
      };
    });
  }, [publicSubmissions]);

  const statusFilterOptions = [
    { value: "completed", label: "Completed" },
    { value: "started", label: "In Progress" },
    { value: "not_started", label: "Not Started" },
  ];

  const publicStatusFilterOptions = [
    { value: "completed", label: "Completed" },
    { value: "started", label: "In Progress" },
  ];

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
            <TabsTrigger value="public-submissions">
              Public Submissions
            </TabsTrigger>
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
            <SubmissionsTable
              columns={classColumns}
              rows={classRows}
              statusFilterOptions={statusFilterOptions}
              profileFields={profileFields}
              displayFieldIds={displayFieldIds}
              filterFieldIds={filterFieldIds}
              showUnlockColumn={requireTeacherUnlock}
              contentName="this assignment"
              onToggleUnlock={handleToggleUnlock}
              emptyMessage={
                classGroupId != null
                  ? "No students in this group yet."
                  : "No students enrolled in this class yet."
              }
            />
          )}
        </TabsContent>

        {isPublic && (
          <TabsContent value="public-submissions" className="mt-6">
            {publicLoading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  Loading public submissions...
                </p>
              </div>
            ) : publicError ? (
              <div className="text-center py-12">
                <p className="text-destructive">{publicError}</p>
              </div>
            ) : (
              <SubmissionsTable
                columns={publicColumns}
                rows={publicRows}
                statusFilterOptions={publicStatusFilterOptions}
                emptyMessage="No public submissions yet."
              />
            )}
          </TabsContent>
        )}
      </Tabs>

      {selectedSubmission && (
        <SubmissionViewDialog
          open={viewDialogOpen}
          onOpenChange={async (open) => {
            setViewDialogOpen(open);
            // Re-fetch the lightweight list when the dialog closes so the table
            // badges (has_pending_approvals) reflect any approvals just made.
            if (!open) {
              if ("student" in selectedSubmission && classDbId) {
                const data = await getSubmissionsByAssignmentWithStudents(
                  assignmentId,
                  classDbId,
                  classGroupId
                );
                setClassSubmissions(data);
              } else if (!("student" in selectedSubmission)) {
                const data = await getPublicSubmissionsByAssignment(assignmentId);
                setPublicSubmissions(data);
              }
            }
          }}
          studentSubmission={selectedSubmission}
        />
      )}
    </div>
  );
}
