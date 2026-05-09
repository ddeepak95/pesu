"use client";

import { useCallback, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  MutedPrimaryTabsList,
  MutedPrimaryTabsTrigger,
} from "@/components/Teacher/Shared/MutedPrimaryTabs";
import {
  StudentSubmissionStatus,
  PublicSubmissionStatus,
  markAttemptsAsStale,
} from "@/lib/queries/submissions";
import {
  unlockContentForStudent,
  lockContentForStudent,
} from "@/lib/queries/teacherUnlocks";
import { deleteContentCompletionForStudent } from "@/lib/queries/contentCompletions";
import SubmissionViewDialog from "./SubmissionViewDialog";
import { IntegrityLockBadge } from "@/components/Shared/Integrity/IntegrityLockBadge";
import { getStudentDisplayName } from "@/lib/utils/displayName";
import SubmissionsTable, {
  SubmissionsTableColumn,
  SubmissionsTableRow,
} from "@/components/Teacher/Shared/SubmissionsTable";
import { showErrorToast } from "@/lib/toast";
import {
  invalidateSubmissionsCache,
  invalidateTeacherUnlocksCache,
  useAllStudentProfiles,
  useAssignmentByIdForTeacher,
  useClassData,
  useContentItemByRefId,
  usePublicSubmissionsForAssignment,
  useProfileFieldsForClass,
  useProgressViewConfig,
  useSubmissionsForAssignment,
  useTeacherUnlocksForContentItem,
} from "@/hooks/swr";
import { useConsumeStudentIdDeepLink } from "@/hooks/useConsumeStudentIdDeepLink";

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
  const classQuery = useClassData(classId);
  const classDbId = classQuery.data?.id ?? null;

  const assignmentQuery = useAssignmentByIdForTeacher(assignmentId);
  const assignment = assignmentQuery.data ?? null;

  const submissionsQuery = useSubmissionsForAssignment({
    assignmentId,
    classId: classDbId,
    classGroupId,
  });
  const publicSubmissionsQuery = usePublicSubmissionsForAssignment(
    isPublic ? assignmentId : null
  );

  const profileFieldsQuery = useProfileFieldsForClass(classDbId);
  const profilesQuery = useAllStudentProfiles(classDbId);
  const progressViewQuery = useProgressViewConfig(classDbId);

  const contentItemQuery = useContentItemByRefId(
    assignment?.id ?? null,
    "formative_assignment",
    classGroupId ?? null
  );
  const contentItem = contentItemQuery.data ?? null;
  const requireTeacherUnlock = !!contentItem?.require_teacher_unlock;

  const unlocksQuery = useTeacherUnlocksForContentItem(
    requireTeacherUnlock ? contentItem?.id ?? null : null
  );

  const classSubmissions = useMemo<StudentSubmissionStatus[]>(
    () => submissionsQuery.data ?? [],
    [submissionsQuery.data]
  );
  const publicSubmissions = useMemo<PublicSubmissionStatus[]>(
    () => publicSubmissionsQuery.data ?? [],
    [publicSubmissionsQuery.data]
  );
  const profileFields = useMemo(
    () => profileFieldsQuery.data ?? [],
    [profileFieldsQuery.data]
  );
  const studentProfilesMap = useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    (profilesQuery.data ?? []).forEach((p) =>
      map.set(p.student_id, p.field_responses)
    );
    return map;
  }, [profilesQuery.data]);
  const displayFieldIds = useMemo(
    () => new Set(progressViewQuery.data?.display_fields ?? []),
    [progressViewQuery.data]
  );
  const filterFieldIds = useMemo(
    () => new Set(progressViewQuery.data?.filter_fields ?? []),
    [progressViewQuery.data]
  );
  const unlockedStudentIds = useMemo(
    () => new Set((unlocksQuery.data ?? []).map((u) => u.student_id)),
    [unlocksQuery.data]
  );
  const totalQuestionCount = assignment?.questions?.length ?? 0;

  const classLoading =
    classQuery.isLoading ||
    submissionsQuery.isLoading ||
    profileFieldsQuery.isLoading ||
    profilesQuery.isLoading ||
    progressViewQuery.isLoading;
  const classError =
    !classQuery.isLoading && classDbId === null
      ? "Class not found"
      : classQuery.error ||
          submissionsQuery.error ||
          profileFieldsQuery.error ||
          profilesQuery.error ||
          progressViewQuery.error
        ? "Failed to load submissions."
        : null;

  const publicLoading =
    isPublic && (publicSubmissionsQuery.isLoading || assignmentQuery.isLoading);
  const publicError =
    isPublic && (publicSubmissionsQuery.error || assignmentQuery.error)
      ? "Failed to load public submissions."
      : null;

  const [selectedSubmission, setSelectedSubmission] = useState<
    StudentSubmissionStatus | PublicSubmissionStatus | null
  >(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);

  const handleViewSubmission = (
    item: StudentSubmissionStatus | PublicSubmissionStatus
  ) => {
    setSelectedSubmission(item);
    setViewDialogOpen(true);
  };

  const openClassSubmissionForStudent = useCallback(
    (studentId: string) => {
      const item = classSubmissions.find(
        (s) => s.student.student_id === studentId
      );
      if (item) {
        setSelectedSubmission(item);
        setViewDialogOpen(true);
      }
    },
    [classSubmissions]
  );

  useConsumeStudentIdDeepLink({
    ready:
      !classLoading &&
      !classError &&
      classDbId !== null &&
      assignment !== null,
    openForStudent: openClassSubmissionForStudent,
  });

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
      if ("student" in item && contentItem?.id) {
        await deleteContentCompletionForStudent({
          contentItemId: contentItem.id,
          studentId: item.student.student_id,
        });
      }

      await invalidateSubmissionsCache();
    } catch (err) {
      console.error("Error resetting attempts:", err);
      showErrorToast("Failed to reset attempts. Please try again.");
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

  const refetchSubmissionLists = async () => {
    await invalidateSubmissionsCache();
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

  const handleToggleUnlock = async (
    studentId: string,
    currentlyUnlocked: boolean
  ) => {
    if (!contentItem?.id) return;

    if (currentlyUnlocked) {
      await lockContentForStudent(contentItem.id, studentId);
    } else {
      await unlockContentForStudent(contentItem.id, studentId);
    }
    await invalidateTeacherUnlocksCache();
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
            <IntegrityLockBadge
              revokedAt={row.data?.integrityRevokedAt as string | undefined}
              reasonCode={row.data?.integrityRevokedReason as string | undefined}
            />
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
          integrityRevokedAt: item.submission?.integrity_access_revoked_at,
          integrityRevokedReason: item.submission?.integrity_access_revoked_reason,
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
            <IntegrityLockBadge
              revokedAt={row.data?.integrityRevokedAt as string | undefined}
              reasonCode={row.data?.integrityRevokedReason as string | undefined}
            />
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
          integrityRevokedAt: item.submission.integrity_access_revoked_at,
          integrityRevokedReason: item.submission.integrity_access_revoked_reason,
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
        <MutedPrimaryTabsList className="mb-4 h-auto w-auto gap-1 rounded-md p-1">
          <MutedPrimaryTabsTrigger
            value="class-students"
            className="rounded-sm px-4 py-2"
          >
            Class Students
          </MutedPrimaryTabsTrigger>
          {isPublic && (
            <MutedPrimaryTabsTrigger
              value="public-submissions"
              className="rounded-sm px-4 py-2"
            >
              Public Submissions
            </MutedPrimaryTabsTrigger>
          )}
        </MutedPrimaryTabsList>

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
              profileFilterStorageKey={`assignment-submissions-filters-${classId}-${assignmentId}`}
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
              await invalidateSubmissionsCache();
            }
          }}
          studentSubmission={selectedSubmission}
          onIntegrityRestored={refetchSubmissionLists}
        />
      )}
    </div>
  );
}
