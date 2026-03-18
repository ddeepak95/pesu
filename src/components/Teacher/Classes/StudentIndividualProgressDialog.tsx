"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, Lock, Unlock, XCircle } from "lucide-react";
import UnlockConfirmDialog from "@/components/Teacher/Shared/UnlockConfirmDialog";
import { StudentWithInfo } from "@/lib/queries/students";
import {
  getClassStudentContentCompletions,
  StudentContentCompletionForStudent,
} from "@/lib/queries/contentCompletions";
import {
  getTeacherUnlocksForStudentInClass,
  lockContentForStudent,
  unlockContentForStudent,
} from "@/lib/queries/teacherUnlocks";
import { getStudentDisplayName } from "@/lib/utils/displayName";
import type { ContentItemType } from "@/types/contentCompletion";

interface StudentIndividualProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classDbId: string;
  student: StudentWithInfo | null;
}

const CONTENT_TYPE_LABELS: Record<ContentItemType, string> = {
  learning_content: "Content",
  quiz: "Quiz",
  formative_assignment: "Activity",
  survey: "Survey",
};

export default function StudentIndividualProgressDialog({
  open,
  onOpenChange,
  classDbId,
  student,
}: StudentIndividualProgressDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<StudentContentCompletionForStudent[]>([]);
  const [unlockedContentItemIds, setUnlockedContentItemIds] = useState<Set<string>>(
    new Set()
  );

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

  useEffect(() => {
    if (!open || !student) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const scopedCompletions = await getClassStudentContentCompletions({
          classDbId,
          studentId: student.student_id,
          studentGroupId: student.group_id,
        });

        setRows(scopedCompletions);

        const contentItemIds = scopedCompletions.map(
          (r) => r.contentItemId
        );
        const unlockedSet = await getTeacherUnlocksForStudentInClass({
          classDbId,
          studentId: student.student_id,
          contentItemIds,
        });
        setUnlockedContentItemIds(unlockedSet);
      } catch (err) {
        console.error("Error fetching individual student progress:", err);
        setError("Failed to load student progress data.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [open, classDbId, student?.student_id, student?.group_id, student]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setRows([]);
      setUnlockedContentItemIds(new Set());
      setError(null);
      setUnlockDialogOpen(false);
      setUnlockDialogTarget(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {studentName ? `Progress for ${studentName}` : "Student Progress"}
          </DialogTitle>
          <DialogDescription>
            View completion status and completion dates for the selected
            student.
          </DialogDescription>
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
                          <div className="text-sm font-medium">
                            {row.contentName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {CONTENT_TYPE_LABELS[row.contentType]}
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

      {/* Unlock confirmation dialog */}
      {unlockDialogTarget && (
        <UnlockConfirmDialog
          open={unlockDialogOpen}
          onOpenChange={setUnlockDialogOpen}
          studentName={unlockDialogTarget.studentName}
          contentName={unlockDialogTarget.contentName}
          isCurrentlyUnlocked={unlockDialogTarget.isCurrentlyUnlocked}
          onConfirm={async () => {
            if (!student) return;
            const {
              contentItemId,
              isCurrentlyUnlocked,
            } = unlockDialogTarget;

            if (isCurrentlyUnlocked) {
              await lockContentForStudent(contentItemId, student.student_id);
              setUnlockedContentItemIds((prev) => {
                const next = new Set(prev);
                next.delete(contentItemId);
                return next;
              });
            } else {
              await unlockContentForStudent(
                contentItemId,
                student.student_id
              );
              setUnlockedContentItemIds((prev) => {
                const next = new Set(prev);
                next.add(contentItemId);
                return next;
              });
            }
          }}
        />
      )}
    </Dialog>
  );
}

