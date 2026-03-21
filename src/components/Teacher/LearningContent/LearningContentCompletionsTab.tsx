"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { LearningContent } from "@/types/learningContent";
import { getClassStudentsWithInfo } from "@/lib/queries/students";
import type { StudentWithInfo } from "@/lib/queries/students";
import { getContentItemByRefId } from "@/lib/queries/contentItems";
import {
  getCompletionsByContentItem,
} from "@/lib/queries/contentCompletions";
import { deleteQuizCompletionForStudent } from "@/lib/queries/quizzes";
import {
  getTeacherUnlocksForContentItem,
  unlockContentForStudent,
  lockContentForStudent,
} from "@/lib/queries/teacherUnlocks";
import { getStudentDisplayName } from "@/lib/utils/displayName";
import SubmissionsTable, {
  SubmissionsTableColumn,
  SubmissionsTableRow,
} from "@/components/Teacher/Shared/SubmissionsTable";
import { showErrorToast } from "@/lib/toast";

interface LearningContentCompletionsTabProps {
  content: LearningContent;
  classId: string;
}

export default function LearningContentCompletionsTab({
  content,
  classId: _classId,
}: LearningContentCompletionsTabProps) {
  const [students, setStudents] = useState<StudentWithInfo[]>([]);
  const [completions, setCompletions] = useState<
    { student_id: string; completed_at: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contentItemId, setContentItemId] = useState<string | null>(null);
  const [requireTeacherUnlock, setRequireTeacherUnlock] = useState(false);
  const [unlockedStudentIds, setUnlockedStudentIds] = useState<Set<string>>(
    new Set()
  );
  const [resetting, setResetting] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [studentsData, contentItem] = await Promise.all([
        getClassStudentsWithInfo(content.class_id),
        getContentItemByRefId(content.id, "learning_content"),
      ]);

      setStudents(studentsData);
      setContentItemId(contentItem?.id ?? null);
      setRequireTeacherUnlock(contentItem?.require_teacher_unlock ?? false);

      if (contentItem?.id) {
        const [completionsData, unlocks] = await Promise.all([
          getCompletionsByContentItem(contentItem.id),
          contentItem.require_teacher_unlock
            ? getTeacherUnlocksForContentItem(contentItem.id)
            : Promise.resolve([]),
        ]);
        setCompletions(completionsData);
        if (contentItem.require_teacher_unlock) {
          setUnlockedStudentIds(new Set(unlocks.map((u) => u.student_id)));
        }
      } else {
        setCompletions([]);
      }
    } catch (err) {
      console.error("Error fetching learning content completions:", err);
      setError("Failed to load completions.");
    } finally {
      setLoading(false);
    }
  }, [content.id, content.class_id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // When content is group-scoped, show only students in that group
  const studentsInScope = useMemo(() => {
    if (content.class_group_id != null) {
      return students.filter((s) => s.group_id === content.class_group_id);
    }
    return students;
  }, [students, content.class_group_id]);

  const completionByStudentId = useMemo(() => {
    const map = new Map<string, string>();
    completions.forEach((c) => map.set(c.student_id, c.completed_at));
    return map;
  }, [completions]);

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

  const handleReset = useCallback(
    async (studentId: string) => {
      if (!contentItemId) return;
      const confirmed = window.confirm(
        "Remove completion for this student? They can mark it complete again."
      );
      if (!confirmed) return;

      setResetting(studentId);
      try {
        await deleteQuizCompletionForStudent({
          contentItemId,
          studentId,
        });
        await fetchData();
      } catch (err) {
        console.error("Error resetting completion:", err);
        showErrorToast("Failed to reset completion. Please try again.");
      } finally {
        setResetting(null);
      }
    },
    [contentItemId, fetchData]
  );

  const columns: SubmissionsTableColumn[] = useMemo(
    () => [
      {
        key: "status",
        label: "Status",
        render: (row) => (
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${
              row.data?.status === "Completed"
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
            }`}
          >
            {(row.data?.status as string) ?? "Not completed"}
          </span>
        ),
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
        content.class_group_id != null
          ? "No students in this group yet."
          : "No students enrolled yet."
      }
    />
  );
}
