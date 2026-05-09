"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Lock, RefreshCw, Unlock, XCircle } from "lucide-react";
import UnlockConfirmDialog from "@/components/Teacher/Shared/UnlockConfirmDialog";
import type { StudentContentCompletionForStudent } from "@/lib/queries/contentCompletions";
import { StudentWithInfo } from "@/lib/queries/students";
import { buildTeacherStudentSubmissionHref } from "@/lib/teacherStudentSubmissionLink";
import {
  lockContentForStudent,
  unlockContentForStudent,
} from "@/lib/queries/teacherUnlocks";
import { getStudentDisplayName } from "@/lib/utils/displayName";
import { cn } from "@/lib/utils";
import type { ContentItemType } from "@/types/contentCompletion";
import {
  invalidateTeacherUnlocksCache,
  useClassStudentContentCompletions,
  useTeacherUnlocksForStudentInClass,
} from "@/hooks/swr";

interface StudentIndividualProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classDbId: string;
  /** Route slug (`classes.class_id`), used for teacher URLs. */
  classRouteId: string;
  student: StudentWithInfo | null;
}

const CONTENT_TYPE_LABELS: Record<ContentItemType, string> = {
  learning_content: "Content",
  quiz: "Quiz",
  formative_assignment: "Activity",
  survey: "Survey",
};

function TeacherSubmissionOpenLink({
  row,
  student,
  classRouteId,
}: {
  row: StudentContentCompletionForStudent;
  student: StudentWithInfo;
  classRouteId: string;
}) {
  const href = buildTeacherStudentSubmissionHref({
    classRouteId,
    contentType: row.contentType,
    routeEntityId: row.routeEntityId,
    placementGroupId: row.placementGroupId,
    studentId: student.student_id,
  });
  if (!href) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <Button variant="outline" size="sm" asChild>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title="Open submission in a new tab (keeps this page loaded)"
      >
        Open
      </a>
    </Button>
  );
}

export default function StudentIndividualProgressDialog({
  open,
  onOpenChange,
  classDbId,
  classRouteId,
  student,
}: StudentIndividualProgressDialogProps) {
  const fetchKey = open && student ? classDbId : null;

  const completionsQuery = useClassStudentContentCompletions({
    classDbId: fetchKey,
    studentId: student?.student_id ?? null,
    studentGroupId: student?.group_id ?? null,
  });

  const rows = useMemo(
    () => completionsQuery.data ?? [],
    [completionsQuery.data]
  );
  const contentItemIds = useMemo(
    () => rows.map((r) => r.contentItemId),
    [rows]
  );

  const unlocksQuery = useTeacherUnlocksForStudentInClass({
    classDbId: fetchKey,
    studentId: student?.student_id ?? null,
    contentItemIds,
  });

  const unlockedContentItemIds = useMemo(
    () => unlocksQuery.data ?? new Set<string>(),
    [unlocksQuery.data]
  );

  const loading =
    open && (completionsQuery.isLoading || unlocksQuery.isLoading);
  const error =
    completionsQuery.error || unlocksQuery.error
      ? "Failed to load student progress data."
      : null;

  const studentName = useMemo(() => {
    if (!student) return "";
    return getStudentDisplayName(student);
  }, [student]);

  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [unlockDialogTarget, setUnlockDialogTarget] = useState<{
    contentItemId: string;
    studentName: string;
    contentName: string;
    isCurrentlyUnlocked: boolean;
  } | null>(null);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setUnlockDialogOpen(false);
      setUnlockDialogTarget(null);
    }
    onOpenChange(newOpen);
  };

  const validating =
    completionsQuery.isValidating || unlocksQuery.isValidating;

  const handleRefreshStudentProgress = useCallback(async () => {
    if (!open || !student) return;
    await completionsQuery.mutate();
    await unlocksQuery.mutate();
  }, [open, student, completionsQuery, unlocksQuery]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[80vh] flex flex-col">
        <DialogHeader className="sm:flex-row sm:justify-between sm:gap-4 sm:space-y-0 pr-10">
          <div className="space-y-1.5">
            <DialogTitle>
              {studentName ? `Progress for ${studentName}` : "Student Progress"}
            </DialogTitle>
            <DialogDescription>
              View completion status and completion dates for the selected
              student.
            </DialogDescription>
          </div>
          {student ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5 self-start"
              disabled={validating}
              title="Reload this student only (does not refresh the class Progress table)"
              aria-label="Refresh student progress"
              onClick={() => void handleRefreshStudentProgress()}
            >
              <RefreshCw
                className={cn("h-4 w-4", validating && "animate-spin")}
              />
              Refresh
            </Button>
          ) : null}
        </DialogHeader>

        <div className="flex-1 overflow-auto mt-3">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                Loading student progress...
              </p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-destructive">{error}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No content items found for this student.
              </p>
            </div>
          ) : (
            <div className="inline-block min-w-full rounded-md border align-top">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-sm sticky top-0 z-10 bg-muted/50">
                      Content
                    </th>
                    <th className="text-left p-3 font-medium text-sm sticky top-0 z-10 bg-muted/50">
                      Status
                    </th>
                    <th className="text-left p-3 font-medium text-sm sticky top-0 z-10 bg-muted/50">
                      Completed At
                    </th>
                    <th className="text-right p-3 font-medium text-sm sticky top-0 z-10 bg-muted/50">
                      Open
                    </th>
                    <th className="text-right p-3 font-medium text-sm sticky top-0 z-10 bg-muted/50">
                      Access
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isUnlocked = unlockedContentItemIds.has(
                      row.contentItemId
                    );
                    const completionDate =
                      row.isComplete && row.completedAt
                        ? new Date(row.completedAt).toLocaleDateString()
                        : null;

                    return (
                      <tr key={row.contentItemId} className="border-b">
                        <td className="p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <div>
                              <div className="text-sm font-medium">
                                {row.contentName}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {CONTENT_TYPE_LABELS[row.contentType]}
                              </div>
                            </div>
                            {row.hasPendingApproval ? (
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 whitespace-nowrap">
                                Pending Approval
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {row.isComplete ? (
                              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                            ) : (
                              <XCircle className="h-5 w-5 text-gray-300 dark:text-gray-600" />
                            )}
                            <span className="text-sm">
                              {row.isComplete ? "Complete" : "Incomplete"}
                            </span>
                          </div>
                        </td>

                        <td className="p-3">
                          {completionDate ? (
                            <span className="text-sm">{completionDate}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>

                        <td className="p-3 text-right">
                          {row.isComplete &&
                          row.routeEntityId &&
                          student ? (
                            <TeacherSubmissionOpenLink
                              row={row}
                              student={student}
                              classRouteId={classRouteId}
                            />
                          ) : (
                            <span
                              className="text-sm text-muted-foreground"
                              title={
                                row.isComplete
                                  ? undefined
                                  : "Available once the student completes this item"
                              }
                            >
                              —
                            </span>
                          )}
                        </td>

                        <td className="p-3 text-right">
                          {row.requireTeacherUnlock ? (
                            <button
                              onClick={() => {
                                setUnlockDialogTarget({
                                  contentItemId: row.contentItemId,
                                  studentName,
                                  contentName: row.contentName,
                                  isCurrentlyUnlocked: isUnlocked,
                                });
                                setUnlockDialogOpen(true);
                              }}
                              className={`p-0.5 rounded hover:bg-muted transition-colors ${
                                isUnlocked
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-gray-400 dark:text-gray-500"
                              }`}
                              title={
                                isUnlocked
                                  ? "Unlocked - click to lock"
                                  : "Locked - click to unlock"
                              }
                            >
                              {isUnlocked ? (
                                <Unlock className="h-4 w-4" />
                              ) : (
                                <Lock className="h-4 w-4" />
                              )}
                            </button>
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              —
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>

      {unlockDialogTarget && (
        <UnlockConfirmDialog
          open={unlockDialogOpen}
          onOpenChange={setUnlockDialogOpen}
          studentName={unlockDialogTarget.studentName}
          contentName={unlockDialogTarget.contentName}
          isCurrentlyUnlocked={unlockDialogTarget.isCurrentlyUnlocked}
          onConfirm={async () => {
            if (!student) return;
            const { contentItemId, isCurrentlyUnlocked } = unlockDialogTarget;

            if (isCurrentlyUnlocked) {
              await lockContentForStudent(contentItemId, student.student_id);
            } else {
              await unlockContentForStudent(
                contentItemId,
                student.student_id
              );
            }
            await invalidateTeacherUnlocksCache();
          }}
        />
      )}
    </Dialog>
  );
}
