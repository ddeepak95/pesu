"use client";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Quiz } from "@/types/quiz";
import type { MCQQuestion } from "@/types/quiz";
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
import { Check, X } from "lucide-react";

interface QuizSubmissionsTabProps {
  quiz: Quiz;
}

function QuizSubmissionViewDialog({
  quiz,
  item,
  open,
  onOpenChange,
}: {
  quiz: Quiz;
  item: QuizSubmissionStatus | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!item?.submission) return null;

  const displayName = getStudentDisplayName(item.student);
  const submittedAt = item.submittedAt
    ? new Date(item.submittedAt).toLocaleString()
    : "—";
  const scoreDisplay =
    item.earnedPoints !== undefined && item.totalPoints !== undefined
      ? `${item.earnedPoints} / ${item.totalPoints} points`
      : "—";

  const answerByQuestionId = new Map(
    item.submission.answers.map((a) => [a.question_id, a.selected_option_id])
  );

  const questionsSorted = [...quiz.questions].sort((a, b) => a.order - b.order);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quiz submission</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {displayName} · {submittedAt}
          </p>
          <p className="text-sm font-medium">{scoreDisplay}</p>
          <div className="space-y-3">
            {questionsSorted.map((q: MCQQuestion, idx: number) => {
              const selectedId = answerByQuestionId.get(q.id);
              const selectedOption = selectedId
                ? q.options.find((o) => o.id === selectedId)
                : null;
              const isCorrect = selectedId === q.correct_option_id;

              return (
                <Card key={q.id}>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm font-medium">
                      Question {idx + 1}: {q.prompt}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 py-0 pb-3">
                    {q.options.map((opt) => {
                      const isSelected = opt.id === selectedId;
                      const isCorrectOption = opt.id === q.correct_option_id;
                      return (
                        <div
                          key={opt.id}
                          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                            isSelected
                              ? isCorrect
                                ? "border-green-500 bg-green-50 dark:bg-green-950/30"
                                : "border-red-500 bg-red-50 dark:bg-red-950/30"
                              : isCorrectOption
                              ? "border-green-300 bg-green-50/50 dark:bg-green-950/20"
                              : ""
                          }`}
                        >
                          {isSelected && (
                            <span className="flex-shrink-0">
                              {isCorrect ? (
                                <Check className="h-4 w-4 text-green-600" />
                              ) : (
                                <X className="h-4 w-4 text-red-600" />
                              )}
                            </span>
                          )}
                          {isCorrectOption && !isSelected && (
                            <span className="flex-shrink-0 text-green-600">
                              <Check className="h-4 w-4" />
                            </span>
                          )}
                          <span>
                            {opt.text}
                            {isSelected && (
                              <span className="ml-1 text-muted-foreground">
                                (selected)
                              </span>
                            )}
                            {isCorrectOption && !isSelected && (
                              <span className="ml-1 text-muted-foreground">
                                (correct)
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                    {!selectedOption && (
                      <p className="text-sm text-muted-foreground italic">
                        No answer selected
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function QuizSubmissionsTab({ quiz }: QuizSubmissionsTabProps) {
  const [submissions, setSubmissions] = useState<QuizSubmissionStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [contentItemId, setContentItemId] = useState<string | null>(null);
  const [viewSubmission, setViewSubmission] =
    useState<QuizSubmissionStatus | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

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

  const handleView = (item: QuizSubmissionStatus) => {
    if (!item.submission) return;
    setViewSubmission(item);
    setViewDialogOpen(true);
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
                onClick={() => handleView(item)}
              >
                View
              </Button>
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
    <>
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
        emptyMessage={
          quiz.class_group_id != null
            ? "No students in this group yet."
            : "No students enrolled yet."
        }
      />
      <QuizSubmissionViewDialog
        quiz={quiz}
        item={viewSubmission}
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
      />
    </>
  );
}
