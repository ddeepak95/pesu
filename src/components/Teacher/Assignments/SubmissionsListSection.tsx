"use client";

import { useCallback, useState, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { IntegrityLockBadge } from "@/components/Shared/Integrity/IntegrityLockBadge";
import { getStudentDisplayName } from "@/lib/utils/displayName";
import { Pill } from "@/components/ui/pill";
import SubmissionsTable, {
  SubmissionsTableColumn,
  SubmissionsTableRow,
} from "@/components/Teacher/Shared/SubmissionsTable";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
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
  useEffectiveClassSettings,
} from "@/hooks/swr";
import { useConsumeStudentIdDeepLink } from "@/hooks/useConsumeStudentIdDeepLink";

interface SubmissionsListSectionProps {
  assignmentId: string;
  classId: string;
  isPublic: boolean;
  classGroupId?: string | null;
  onViewSubmission: (submissionId: string) => void;
}

export function SubmissionsListSection({
  assignmentId,
  classId,
  isPublic,
  classGroupId,
  onViewSubmission,
}: SubmissionsListSectionProps) {
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

  const [resetting, setResetting] = useState<string | null>(null);
  const [bulkApproveDialogOpen, setBulkApproveDialogOpen] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);

  const { data: effectiveClassSettings } = useEffectiveClassSettings(classDbId);
  const bulkFeedbackApprovalEnabled =
    effectiveClassSettings?.enable_bulk_feedback_approval?.value === true;

  const openClassSubmissionForStudent = useCallback(
    (studentId: string) => {
      const item = classSubmissions.find(
        (s) => s.student.student_id === studentId
      );
      if (item?.submission) {
        onViewSubmission(item.submission.submission_id);
      }
    },
    [classSubmissions, onViewSubmission]
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

  const getStatusBadge = (status: "completed" | "started" | "not_started") => {
    switch (status) {
      case "completed":
        return (
          <Pill purpose="submissionCompleted" size="md">
            Completed
          </Pill>
        );
      case "started":
        return (
          <Pill purpose="submissionInProgress" size="md">
            In Progress
          </Pill>
        );
      case "not_started":
        return (
          <Pill purpose="submissionNotStarted" size="md">
            Not Started
          </Pill>
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

  const classColumns: SubmissionsTableColumn[] = useMemo(() => {
    const cols: SubmissionsTableColumn[] = [
      {
        key: "status",
        label: "Status",
        render: (row) => (
          <div className="flex flex-wrap items-center gap-1.5">
            {getStatusBadge(
              row.data?.status as "completed" | "started" | "not_started"
            )}
            <IntegrityLockBadge
              revokedAt={row.data?.integrityRevokedAt as string | undefined}
              reasonCode={
                row.data?.integrityRevokedReason as string | undefined
              }
            />
            {!!(row.data?.hasPendingApprovals) && (
              <Pill purpose="pendingApproval" size="md">
                Pending Approval
              </Pill>
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
          <div className="text-sm">{row.data?.scoreDisplay as string}</div>
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
                    onClick={() =>
                      onViewSubmission(item.submission!.submission_id)
                    }
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
  }, [resetting, totalQuestionCount, onViewSubmission]);

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
          integrityRevokedReason:
            item.submission?.integrity_access_revoked_reason,
          _original: item,
        },
      };
    });
  }, [classSubmissions, studentProfilesMap, unlockedStudentIds]);

  const publicColumns: SubmissionsTableColumn[] = useMemo(() => {
    return [
      {
        key: "status",
        label: "Status",
        render: (row) => (
          <div className="flex flex-wrap items-center gap-1.5">
            {getStatusBadge(
              row.data?.status as "completed" | "started" | "not_started"
            )}
            <IntegrityLockBadge
              revokedAt={row.data?.integrityRevokedAt as string | undefined}
              reasonCode={
                row.data?.integrityRevokedReason as string | undefined
              }
            />
            {!!(row.data?.hasPendingApprovals) && (
              <Pill purpose="pendingApproval" size="md">
                Pending Approval
              </Pill>
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
          <div className="text-sm">{row.data?.scoreDisplay as string}</div>
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
                onClick={() =>
                  onViewSubmission(item.submission.submission_id)
                }
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
  }, [resetting, totalQuestionCount, onViewSubmission]);

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
          integrityRevokedReason:
            item.submission.integrity_access_revoked_reason,
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

  const pendingClassCount = useMemo(
    () => classSubmissions.filter((s) => s.hasPendingApprovals).length,
    [classSubmissions]
  );
  const pendingPublicCount = useMemo(
    () => publicSubmissions.filter((s) => s.hasPendingApprovals).length,
    [publicSubmissions]
  );
  const totalPendingCount = pendingClassCount + pendingPublicCount;

  const showBulkApproveButton =
    !!assignment?.feedback_requires_approval &&
    bulkFeedbackApprovalEnabled &&
    totalPendingCount > 0;

  const handleBulkApproveDialogOpenChange = (open: boolean) => {
    if (!open) setBulkApproving(false);
    setBulkApproveDialogOpen(open);
  };

  const handleBulkApprove = async () => {
    setBulkApproving(true);
    try {
      const res = await fetch("/api/submissions/bulk-approve-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to approve pending feedback");
      }
      await invalidateSubmissionsCache();

      const submissionCount =
        (data.affectedSubmissionCount as number | undefined) ?? totalPendingCount;
      const attemptCount = data.approvedAttemptCount as number | undefined;
      const submissionLabel = submissionCount === 1 ? "submission" : "submissions";
      const attemptSuffix =
        attemptCount != null && attemptCount > 0
          ? ` (${attemptCount} feedback ${attemptCount === 1 ? "item" : "items"})`
          : "";
      showSuccessToast(
        `Approved pending feedback for ${submissionCount} ${submissionLabel}${attemptSuffix}.`
      );
      handleBulkApproveDialogOpenChange(false);
    } catch (err) {
      console.error("Bulk approve error:", err);
      showErrorToast(
        err instanceof Error
          ? err.message
          : "Failed to approve pending feedback. Please try again."
      );
    } finally {
      setBulkApproving(false);
    }
  };

  return (
    <div className="py-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Submissions</h2>
          <p className="text-sm text-muted-foreground">
            View and manage student submissions for this assignment.
          </p>
        </div>
        {showBulkApproveButton && (
          <Button
            variant="default"
            size="sm"
            onClick={() => setBulkApproveDialogOpen(true)}
            className="shrink-0"
          >
            {`Approve all pending (${totalPendingCount})`}
          </Button>
        )}
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

      <Dialog
        open={bulkApproveDialogOpen}
        onOpenChange={handleBulkApproveDialogOpenChange}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Approve all pending feedback</DialogTitle>
            <DialogDescription>
              Approve pending feedback for{" "}
              <span className="font-medium text-foreground">
                {totalPendingCount} submission
                {totalPendingCount === 1 ? "" : "s"}
              </span>{" "}
              on this assignment. Feedback will be published as the AI generated
              it, without individual review.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleBulkApproveDialogOpenChange(false)}
              disabled={bulkApproving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleBulkApprove}
              disabled={bulkApproving}
            >
              {bulkApproving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                "Approve all"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
