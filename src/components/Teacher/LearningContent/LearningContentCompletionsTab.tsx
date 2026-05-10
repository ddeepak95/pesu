"use client";

import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { LearningContent } from "@/types/learningContent";
import type { StudentWithInfo } from "@/lib/queries/students";
import { deleteQuizCompletionForStudent } from "@/lib/queries/quizzes";
import {
  unlockContentForStudent,
  lockContentForStudent,
} from "@/lib/queries/teacherUnlocks";
import { getStudentDisplayName } from "@/lib/utils/displayName";
import { Pill } from "@/components/ui/pill";
import SubmissionsTable, {
  SubmissionsTableColumn,
  SubmissionsTableRow,
} from "@/components/Teacher/Shared/SubmissionsTable";
import { showErrorToast } from "@/lib/toast";
import {
  invalidateClassContentCompletionsCache,
  invalidateTeacherUnlocksCache,
  useClassStudents,
  useCompletionsByContentItem,
  useContentItemByRefId,
  useTeacherUnlocksForContentItem,
} from "@/hooks/swr";

interface LearningContentCompletionsTabProps {
  content: LearningContent;
  classId: string;
  placementGroupId?: string | null;
}

export default function LearningContentCompletionsTab({
  content,
  classId: _classId,
  placementGroupId,
}: LearningContentCompletionsTabProps) {
  const studentsQuery = useClassStudents(content.class_id);
  const contentItemQuery = useContentItemByRefId(
    content.id,
    "learning_content",
    placementGroupId
  );
  const contentItem = contentItemQuery.data ?? null;

  const completionsQuery = useCompletionsByContentItem(contentItem?.id ?? null);
  const requireTeacherUnlock = !!contentItem?.require_teacher_unlock;
  const unlocksQuery = useTeacherUnlocksForContentItem(
    requireTeacherUnlock ? contentItem?.id ?? null : null
  );

  const students = useMemo<StudentWithInfo[]>(
    () => studentsQuery.data ?? [],
    [studentsQuery.data]
  );
  const completions = useMemo(
    () => completionsQuery.data ?? [],
    [completionsQuery.data]
  );
  const unlockedStudentIds = useMemo(
    () => new Set((unlocksQuery.data ?? []).map((u) => u.student_id)),
    [unlocksQuery.data]
  );

  const loading =
    studentsQuery.isLoading ||
    contentItemQuery.isLoading ||
    completionsQuery.isLoading;
  const error =
    studentsQuery.error || contentItemQuery.error || completionsQuery.error
      ? "Failed to load completions."
      : null;

  const [resetting, setResetting] = useState<string | null>(null);

  const scopeGroupId = placementGroupId ?? content.class_group_id ?? null;
  const studentsInScope = useMemo(() => {
    if (scopeGroupId != null) {
      return students.filter((s) => s.group_id === scopeGroupId);
    }
    return students;
  }, [students, scopeGroupId]);

  const completionByStudentId = useMemo(() => {
    const map = new Map<string, string>();
    completions.forEach((c) => map.set(c.student_id, c.completed_at));
    return map;
  }, [completions]);

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

  const handleReset = useCallback(
    async (studentId: string) => {
      if (!contentItem?.id) return;
      const confirmed = window.confirm(
        "Remove completion for this student? They can mark it complete again."
      );
      if (!confirmed) return;

      setResetting(studentId);
      try {
        await deleteQuizCompletionForStudent({
          contentItemId: contentItem.id,
          studentId,
        });
        await invalidateClassContentCompletionsCache();
      } catch (err) {
        console.error("Error resetting completion:", err);
        showErrorToast("Failed to reset completion. Please try again.");
      } finally {
        setResetting(null);
      }
    },
    [contentItem?.id]
  );

  const columns: SubmissionsTableColumn[] = useMemo(
    () => [
      {
        key: "status",
        label: "Status",
        render: (row) => {
          const status = (row.data?.status as string) ?? "Not completed";
          const completed = status === "Completed";
          return (
            <Pill
              purpose={
                completed ? "submissionCompleted" : "submissionNotStarted"
              }
              size="md"
            >
              {status}
            </Pill>
          );
        },
        sortValue: (row) =>
          (row.data?.status as string) === "Completed" ? 0 : 1,
      },
      {
        key: "completed",
        label: "Completed",
        render: (row) => (
          <div className="text-sm">
            {(row.data?.completedAt as string) ?? "–"}
          </div>
        ),
        sortValue: (row) =>
          row.data?.completedAtRaw
            ? new Date(row.data.completedAtRaw as string).getTime()
            : 0,
      },
      {
        key: "actions",
        label: "Actions",
        align: "right",
        sortable: false,
        render: (row) => {
          const studentId = row.id as string;
          const isCompleted = (row.data?.status as string) === "Completed";
          if (!isCompleted) return null;
          return (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleReset(studentId)}
              disabled={resetting === studentId}
            >
              {resetting === studentId ? "Resetting..." : "Reset"}
            </Button>
          );
        },
      },
    ],
    [resetting, handleReset]
  );

  const rows: SubmissionsTableRow[] = useMemo(() => {
    return studentsInScope.map((student) => {
      const completedAt = completionByStudentId.get(student.student_id) ?? null;
      const status = completedAt ? "Completed" : "Not completed";
      const completedAtFormatted = completedAt
        ? new Date(completedAt).toLocaleString()
        : "–";

      return {
        id: student.student_id,
        name: getStudentDisplayName(student),
        email: student.student_email,
        status,
        isUnlocked: unlockedStudentIds.has(student.student_id),
        data: {
          status,
          completedAt: completedAtFormatted,
          completedAtRaw: completedAt,
        },
      };
    });
  }, [studentsInScope, completionByStudentId, unlockedStudentIds]);

  const statusFilterOptions = [
    { value: "Completed", label: "Completed" },
    { value: "Not completed", label: "Not completed" },
  ];

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Loading completions...</p>
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
    <SubmissionsTable
      columns={columns}
      rows={rows}
      statusFilterOptions={statusFilterOptions}
      profileFields={[]}
      displayFieldIds={new Set()}
      filterFieldIds={new Set()}
      showUnlockColumn={requireTeacherUnlock}
      contentName={content.title}
      onToggleUnlock={handleToggleUnlock}
      emptyMessage={
        scopeGroupId != null
          ? "No students in this group yet."
          : "No students enrolled yet."
      }
    />
  );
}
