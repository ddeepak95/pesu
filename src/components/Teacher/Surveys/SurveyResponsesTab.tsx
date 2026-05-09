"use client";

import { useState, useMemo, useCallback } from "react";
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
import {
  deleteSurveyResponseForStudent,
  SurveyResponseWithStudent,
} from "@/lib/queries/surveyResponses";
import {
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
import {
  invalidateClassContentCompletionsCache,
  invalidateSurveyResponsesCache,
  invalidateTeacherUnlocksCache,
  useClassStudents,
  useContentItemByRefId,
  useSurveyResponses,
  useTeacherUnlocksForContentItem,
} from "@/hooks/swr";
import { Download } from "lucide-react";
import {
  CSV_UTF8_BOM,
  escapeCsvCell,
  sanitizeFilenameSegment,
} from "@/lib/csv";

interface SurveyResponsesTabProps {
  survey: Survey;
  classId: string;
  placementGroupId?: string | null;
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

function buildSurveyResponsesCsv(survey: Survey, items: SurveyRowItem[]): string {
  const questionsToShow = survey.questions
    .filter((q) => q.type !== "section_title")
    .sort((a, b) => a.order - b.order);

  const headerCells = [
    "student_id",
    "student_display_name",
    "student_email",
    "status",
    "submitted_at",
    ...questionsToShow.map((q) => `${q.order}. ${q.prompt}`),
  ];

  const lines = [headerCells.map(escapeCsvCell).join(",")];

  for (const { student, response } of items) {
    const answerMap = response
      ? new Map(response.answers.map((a) => [a.question_order, a.value]))
      : new Map<number, string | number>();

    const status = response ? "Submitted" : "Not submitted";
    const submittedAt = response?.submitted_at ?? "";

    const rowCells = [
      student.student_id,
      student.student_display_name ?? "",
      student.student_email ?? "",
      status,
      submittedAt,
      ...questionsToShow.map((q) => {
        const raw = answerMap.get(q.order);
        if (raw === undefined || raw === null) return "";
        return formatAnswerValue(q, raw);
      }),
    ];

    lines.push(rowCells.map(escapeCsvCell).join(","));
  }

  return `${CSV_UTF8_BOM}${lines.join("\r\n")}`;
}

function surveyResponsesCsvFilename(survey: Survey): string {
  const date = new Date().toISOString().slice(0, 10);
  const title = sanitizeFilenameSegment(survey.title, "survey");
  return `survey-responses-${survey.survey_id}-${title}-${date}.csv`;
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
  placementGroupId,
}: SurveyResponsesTabProps) {
  const studentsQuery = useClassStudents(survey.class_id);
  const responsesQuery = useSurveyResponses({
    surveyId: survey.id,
    classDbId: survey.class_id,
  });
  const contentItemQuery = useContentItemByRefId(survey.id, "survey", placementGroupId);

  const contentItem = contentItemQuery.data ?? null;
  const requireTeacherUnlock = !!contentItem?.require_teacher_unlock;
  const unlocksQuery = useTeacherUnlocksForContentItem(
    requireTeacherUnlock ? contentItem?.id ?? null : null
  );

  const students = useMemo<StudentWithInfo[]>(
    () => studentsQuery.data ?? [],
    [studentsQuery.data]
  );
  const responsesWithStudents = useMemo(
    () => responsesQuery.data ?? [],
    [responsesQuery.data]
  );
  const unlockedStudentIds = useMemo(
    () => new Set((unlocksQuery.data ?? []).map((u) => u.student_id)),
    [unlocksQuery.data]
  );

  const loading =
    studentsQuery.isLoading ||
    responsesQuery.isLoading ||
    contentItemQuery.isLoading;
  const error =
    studentsQuery.error || responsesQuery.error || contentItemQuery.error
      ? "Failed to load responses."
      : null;

  const [viewResponse, setViewResponse] =
    useState<SurveyResponseWithStudent | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);

  const responseByStudentId = useMemo(() => {
    const map = new Map<string, SurveyResponseWithStudent>();
    responsesWithStudents.forEach((r) => map.set(r.student_id, r));
    return map;
  }, [responsesWithStudents]);

  const scopeGroupId = placementGroupId ?? survey.class_group_id ?? null;
  const studentsInScope = useMemo(() => {
    if (scopeGroupId != null) {
      return students.filter((s) => s.group_id === scopeGroupId);
    }
    return students;
  }, [students, scopeGroupId]);

  const csvRowItems = useMemo<SurveyRowItem[]>(
    () =>
      studentsInScope.map((student) => ({
        student,
        response: responseByStudentId.get(student.student_id) ?? null,
      })),
    [studentsInScope, responseByStudentId]
  );

  const handleDownloadCsv = useCallback(() => {
    const csv = buildSurveyResponsesCsv(survey, csvRowItems);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = surveyResponsesCsvFilename(survey);
    a.click();
    URL.revokeObjectURL(url);
  }, [survey, csvRowItems]);

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
        if (contentItem?.id) {
          await deleteQuizCompletionForStudent({
            contentItemId: contentItem.id,
            studentId: item.student.student_id,
          });
        }
        await Promise.all([
          invalidateSurveyResponsesCache(),
          invalidateClassContentCompletionsCache(),
        ]);
      } catch (err) {
        console.error("Error resetting survey response:", err);
        showErrorToast("Failed to reset response. Please try again.");
      } finally {
        setResetting(null);
      }
    },
    [survey.id, contentItem?.id]
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
          scopeGroupId != null
            ? "No students in this group yet."
            : "No students enrolled yet."
        }
        toolbarEndExtra={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleDownloadCsv}
            title="Download CSV"
            aria-label="Download survey responses as CSV"
          >
            <Download />
          </Button>
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
