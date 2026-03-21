"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Survey } from "@/types/survey";
import type { SurveyQuestion, LikertQuestion } from "@/types/survey";
import { getClassStudentsWithInfo } from "@/lib/queries/students";
import {
  getSurveyResponsesWithStudents,
  deleteSurveyResponseForStudent,
  SurveyResponseWithStudent,
} from "@/lib/queries/surveyResponses";
import { getContentItemByRefId } from "@/lib/queries/contentItems";
import {
  getTeacherUnlocksForContentItem,
  unlockContentForStudent,
  lockContentForStudent,
} from "@/lib/queries/teacherUnlocks";
import { showErrorToast } from "@/lib/toast";
import { deleteQuizCompletionForStudent } from "@/lib/queries/quizzes";
import { getStudentDisplayName } from "@/lib/utils/displayName";
import type { StudentWithInfo } from "@/lib/queries/students";
import SubmissionsTable, {
  SubmissionsTableColumn,
  SubmissionsTableRow,
} from "@/components/Teacher/Shared/SubmissionsTable";

interface SurveyResponsesTabProps {
  survey: Survey;
  classId: string;
}

interface SurveyRowItem {
  student: StudentWithInfo;
  response: SurveyResponseWithStudent | null;
}

function formatAnswerValue(
  question: SurveyQuestion,
  value: string | number
): string {
  if (question.type === "likert") {
    const opt = (question as LikertQuestion).options.find(
      (o) => o.value === value
    );
    return opt ? opt.text : String(value);
  }
  return String(value);
}

function SurveyResponseViewDialog({
  survey,
  response,
  open,
  onOpenChange,
}: {
  survey: Survey;
  response: SurveyResponseWithStudent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!response) return null;

  const displayName =
    response.student_display_name ||
    response.student_email ||
    response.student_id.substring(0, 8) + "...";
  const submittedAt = new Date(response.submitted_at).toLocaleString();

  const answerMap = new Map(
    response.answers.map((a) => [a.question_order, a.value])
  );

  const questionsToShow = survey.questions
    .filter((q) => q.type !== "section_title")
    .sort((a, b) => a.order - b.order);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Survey response</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {displayName} · {submittedAt}
          </p>
          <div className="space-y-3">
            {questionsToShow.map((q, idx) => {
              const value = answerMap.get(q.order);
              const display =
                value !== undefined && value !== null
                  ? formatAnswerValue(q, value)
                  : "—";
              return (
                <Card key={idx}>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm font-medium">
                      {q.prompt}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-0 pb-3 text-sm text-muted-foreground">
                    {display}
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

export default function SurveyResponsesTab({
  survey,
  classId: _classId,
}: SurveyResponsesTabProps) {
  const [students, setStudents] = useState<StudentWithInfo[]>([]);
  const [responsesWithStudents, setResponsesWithStudents] = useState<
    SurveyResponseWithStudent[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contentItemId, setContentItemId] = useState<string | null>(null);
  const [requireTeacherUnlock, setRequireTeacherUnlock] = useState(false);
  const [unlockedStudentIds, setUnlockedStudentIds] = useState<Set<string>>(
    new Set()
  );
  const [viewResponse, setViewResponse] =
    useState<SurveyResponseWithStudent | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [studentsData, responsesData, contentItem] = await Promise.all([
        getClassStudentsWithInfo(survey.class_id),
        getSurveyResponsesWithStudents(survey.id, survey.class_id),
        getContentItemByRefId(survey.id, "survey"),
      ]);

      setStudents(studentsData);
      setResponsesWithStudents(responsesData);
      setContentItemId(contentItem?.id ?? null);
      setRequireTeacherUnlock(contentItem?.require_teacher_unlock ?? false);

      if (contentItem?.require_teacher_unlock && contentItem?.id) {
        const unlocks = await getTeacherUnlocksForContentItem(contentItem.id);
        setUnlockedStudentIds(new Set(unlocks.map((u) => u.student_id)));
      }
    } catch (err) {
      console.error("Error fetching survey responses:", err);
      setError("Failed to load responses.");
    } finally {
      setLoading(false);
    }
  }, [survey.id, survey.class_id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const responseByStudentId = useMemo(() => {
    const map = new Map<string, SurveyResponseWithStudent>();
    responsesWithStudents.forEach((r) => map.set(r.student_id, r));
    return map;
  }, [responsesWithStudents]);

  // When survey is group-scoped, show only students in that group
  const studentsInScope = useMemo(() => {
    if (survey.class_group_id != null) {
      return students.filter((s) => s.group_id === survey.class_group_id);
    }
    return students;
  }, [students, survey.class_group_id]);

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

  const handleView = (item: SurveyRowItem) => {
    if (!item.response) return;
    setViewResponse(item.response);
    setViewDialogOpen(true);
  };

  const handleReset = useCallback(
    async (item: SurveyRowItem) => {
      if (!item.response) return;
      const confirmed = window.confirm(
        `Reset response for ${getStudentDisplayName(item.student)}? They will be able to submit the survey again.`
      );
      if (!confirmed) return;

      setResetting(item.student.student_id);
      try {
        await deleteSurveyResponseForStudent({
          surveyId: survey.id,
          studentId: item.student.student_id,
        });
        if (contentItemId) {
          await deleteQuizCompletionForStudent({
            contentItemId,
            studentId: item.student.student_id,
          });
        }
        await fetchData();
      } catch (err) {
        console.error("Error resetting survey response:", err);
        showErrorToast("Failed to reset response. Please try again.");
      } finally {
        setResetting(null);
      }
    },
    [survey.id, contentItemId, fetchData]
  );

  const columns: SubmissionsTableColumn[] = useMemo(
    () => [
      {
        key: "status",
        label: "Status",
        render: (row) => (
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${
              row.data?.status === "Submitted"
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
            }`}
          >
            {(row.data?.status as string) ?? "Not submitted"}
          </span>
        ),
        sortValue: (row) =>
          (row.data?.status as string) === "Submitted" ? 0 : 1,
      },
      {
        key: "submitted",
        label: "Submitted",
        render: (row) => (
          <div className="text-sm">
            {(row.data?.submittedAt as string) ?? "–"}
          </div>
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
          const item = row.data?._original as SurveyRowItem;
          if (!item?.response) return null;
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
                {resetting === item.student.student_id ? "Resetting..." : "Reset"}
              </Button>
            </div>
          );
        },
      },
    ],
    [resetting, handleReset]
  );

  const rows: SubmissionsTableRow[] = useMemo(() => {
    return studentsInScope.map((student) => {
      const response = responseByStudentId.get(student.student_id) ?? null;
      const status = response ? "Submitted" : "Not submitted";
      const submittedAt = response
        ? new Date(response.submitted_at).toLocaleString()
        : "–";
      const item: SurveyRowItem = { student, response };

      return {
        id: student.student_id,
        name: getStudentDisplayName(student),
        email: student.student_email,
        status,
        isUnlocked: unlockedStudentIds.has(student.student_id),
        data: {
          status,
          submittedAt,
          submittedAtRaw: response?.submitted_at ?? null,
          _original: item,
        },
      };
    });
  }, [studentsInScope, responseByStudentId, unlockedStudentIds]);

  const statusFilterOptions = [
    { value: "Submitted", label: "Submitted" },
    { value: "Not submitted", label: "Not submitted" },
  ];

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Loading responses...</p>
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
        profileFields={[]}
        displayFieldIds={new Set()}
        filterFieldIds={new Set()}
        showUnlockColumn={requireTeacherUnlock}
        contentName={survey.title}
        onToggleUnlock={handleToggleUnlock}
        emptyMessage={
          survey.class_group_id != null
            ? "No students in this group yet."
            : "No students enrolled yet."
        }
      />
      <SurveyResponseViewDialog
        survey={survey}
        response={viewResponse}
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
      />
    </>
  );
}
