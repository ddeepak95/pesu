"use client";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Quiz } from "@/types/quiz";
import { getContentItemByRefId } from "@/lib/queries/contentItems";
import {
  deleteQuizCompletionForStudent,
  deleteQuizSubmissionForStudent,
  getQuizSubmissionsByQuizWithStudents,
  QuizSubmissionStatus,
} from "@/lib/queries/quizzes";
import { getStudentDisplayName } from "@/lib/utils/displayName";
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
import SubmissionsTable, {
  SubmissionsTableColumn,
  SubmissionsTableRow,
} from "@/components/Teacher/Shared/SubmissionsTable";
import { ProfileField } from "@/types/profileFields";

interface QuizSubmissionsTabProps {
  quiz: Quiz;
}

export default function QuizSubmissionsTab({ quiz }: QuizSubmissionsTabProps) {
  const [submissions, setSubmissions] = useState<QuizSubmissionStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [contentItemId, setContentItemId] = useState<string | null>(null);

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

  const fetchSubmissions = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, contentItem] = await Promise.all([
        getQuizSubmissionsByQuizWithStudents(quiz),
        getContentItemByRefId(quiz.id, "quiz"),
      ]);
      setSubmissions(rows);
      setContentItemId(contentItem?.id ?? null);

      // Fetch profile and teacher unlock data if we have a content item
      if (contentItem) {
        setRequireTeacherUnlock(
          contentItem.require_teacher_unlock ?? false
        );

        // quiz.class_id is the database UUID (classes.id)
        const classDbId = quiz.class_id;
        const [fields, profiles, savedConfig] = await Promise.all([
          getProfileFieldsForClass(classDbId),
          getAllStudentProfiles(classDbId),
          getProgressViewConfig(classDbId),
        ]);

        setProfileFields(fields);
        const profilesMap = new Map<string, Record<string, string>>();
        profiles.forEach((p) => {
          profilesMap.set(p.student_id, p.field_responses);
        });
        setStudentProfilesMap(profilesMap);
        setDisplayFieldIds(
          new Set<string>(savedConfig?.display_fields ?? [])
        );
        setFilterFieldIds(
          new Set<string>(savedConfig?.filter_fields ?? [])
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
      console.error("Error fetching quiz submissions:", err);
      setError("Failed to load submissions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz.id]);

  const handleReset = async (item: QuizSubmissionStatus) => {
    if (!item.submission) return;
    const confirmed = window.confirm(
      `Reset submission for ${getStudentDisplayName(item.student)}? This will delete their submission and allow them to resubmit.`
    );
    if (!confirmed) return;

    setResetting(item.student.student_id);
    try {
      await deleteQuizSubmissionForStudent({
        quizId: quiz.id,
        studentId: item.student.student_id,
      });
      if (contentItemId) {
        await deleteQuizCompletionForStudent({
          contentItemId,
          studentId: item.student.student_id,
        });
      }
      await fetchSubmissions();
    } catch (err) {
      console.error("Error resetting submission:", err);
      alert("Failed to reset submission. Please try again.");
    } finally {
      setResetting(null);
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

  // Build columns
  const columns: SubmissionsTableColumn[] = useMemo(() => {
    return [
      {
        key: "status",
        label: "Status",
        render: (row) => (
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${
              row.data?.status === "completed"
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
            }`}
          >
            {row.data?.status === "completed" ? "Completed" : "Not started"}
          </span>
        ),
        sortValue: (row) =>
          row.data?.status === "completed" ? 0 : 1,
      },
      {
        key: "score",
        label: "Score",
        render: (row) => (
          <div className="text-sm">{row.data?.scoreDisplay as string}</div>
        ),
        sortValue: (row) => (row.data?.earnedPoints as number) ?? -1,
      },
      {
        key: "submitted",
        label: "Submitted",
        render: (row) => (
          <div className="text-sm">{row.data?.submittedAt as string}</div>
        ),
        sortValue: (row) =>
          row.data?.submittedAtRaw
            ? new Date(row.data.submittedAtRaw as string).getTime()
            : 0,
      },
      {
        key: "actions",
        label: "Actions",
        align: "right",
        sortable: false,
        render: (row) => {
          const item = row.data?._original as QuizSubmissionStatus;
          if (!item?.submission) return null;
          return (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleReset(item)}
                disabled={resetting === item.student.student_id}
              >
                {resetting === item.student.student_id
                  ? "Resetting..."
                  : "Reset"}
              </Button>
            </div>
          );
        },
      },
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetting]);

  // Build rows
  const rows: SubmissionsTableRow[] = useMemo(() => {
    return submissions.map((item) => {
      const scoreDisplay =
        item.earnedPoints !== undefined && item.totalPoints !== undefined
          ? `${item.earnedPoints}/${item.totalPoints}`
          : "-";
      const submittedAt = item.submittedAt
        ? new Date(item.submittedAt).toLocaleString()
        : "-";

      return {
        id: item.student.student_id,
        name: getStudentDisplayName(item.student),
        email: item.student.student_email,
        status: item.status,
        profileData:
          studentProfilesMap.get(item.student.student_id) ?? {},
        isUnlocked: unlockedStudentIds.has(item.student.student_id),
        data: {
          status: item.status,
          scoreDisplay,
          earnedPoints: item.earnedPoints,
          submittedAt,
          submittedAtRaw: item.submittedAt,
          _original: item,
        },
      };
    });
  }, [submissions, studentProfilesMap, unlockedStudentIds]);

  const statusFilterOptions = [
    { value: "completed", label: "Completed" },
    { value: "not_started", label: "Not started" },
  ];

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
    <SubmissionsTable
      columns={columns}
      rows={rows}
      statusFilterOptions={statusFilterOptions}
      profileFields={profileFields}
      displayFieldIds={displayFieldIds}
      filterFieldIds={filterFieldIds}
      showUnlockColumn={requireTeacherUnlock}
      contentName={quiz.title}
      onToggleUnlock={handleToggleUnlock}
      emptyMessage="No students enrolled yet."
    />
  );
}
