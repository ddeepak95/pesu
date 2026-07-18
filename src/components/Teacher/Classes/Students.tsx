"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Class, ProgressViewConfig } from "@/types/class";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCoTeacherForClass } from "@/hooks/swr";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  MutedPrimaryTabsList,
  MutedPrimaryTabsTrigger,
} from "@/components/Teacher/Shared/MutedPrimaryTabs";
import { sanitizeFilenameSegment } from "@/lib/csv";
import ManageStudentsDialog from "./ManageStudentsDialog";
import StudentListItemMenu from "./StudentListItemMenu";
import ChangeGroupDialog from "./ChangeGroupDialog";
import DeleteStudentDialog from "./DeleteStudentDialog";
import StudentIndividualProgressDialog from "./StudentIndividualProgressDialog";
import SubmissionsTable, {
  SubmissionsTableColumn,
  SubmissionsTableRow,
} from "@/components/Teacher/Shared/SubmissionsTable";
import { StudentWithInfo } from "@/lib/queries/students";
import { getStudentDisplayName } from "@/lib/utils/displayName";
import { ClassGroup } from "@/lib/queries/groups";
import {
  getStudentGroupLabel,
  useClassStudentsData,
} from "./hooks/useClassStudentsData";
import StudentsAnalyticsTab from "./StudentsAnalyticsTab";
import StudentsTableConfigMenu from "./StudentsTableConfigMenu";
import ClassStudentsCsvExportDialog from "./ClassStudentsCsvExportDialog";
import {
  buildClassStudentsCsv,
  getClassStudentsCsvColumnOptions,
} from "./classStudentsCsvColumns";
import { STUDENT_COLUMN_META } from "./studentsTableConfig";

type StudentsSubTab = "table" | "analytics";

type ProgressStatsShape = {
  completed: number;
  total: number;
  lastCompletedAt: string | null;
};

function downloadCsvFile(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** UTC date + time, filesystem-safe (no `:`). */
function csvFilenameDateTime(): string {
  return new Date()
    .toISOString()
    .slice(0, 19)
    .replace("T", "_")
    .replace(/:/g, "-");
}

interface StudentsProps {
  classData: Class;
  /** Whether the Analytics sub-tab is available (institution default → class override). */
  showAnalyticsTab: boolean;
}

export default function Students({
  classData,
  showAnalyticsTab,
}: StudentsProps) {
  const router = useTrackedRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { data: isTeacher } = useIsCoTeacherForClass(
    user?.id ? classData.id : null,
    user?.id ?? null,
  );
  const isStaffTeacher = isTeacher === true;
  const [manageDialogOpen, setManageDialogOpen] = useState(false);

  // Change group dialog state
  const [changeGroupDialogOpen, setChangeGroupDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] =
    useState<StudentWithInfo | null>(null);

  // Delete student dialog state
  const [deleteStudentDialogOpen, setDeleteStudentDialogOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] =
    useState<StudentWithInfo | null>(null);

  // Individual progress dialog state
  const [individualProgressDialogOpen, setIndividualProgressDialogOpen] =
    useState(false);
  const [individualProgressStudent, setIndividualProgressStudent] =
    useState<StudentWithInfo | null>(null);

  const [csvExportOpen, setCsvExportOpen] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const activeStudentsTab = useMemo((): StudentsSubTab => {
    const t = searchParams.get("studentsTab");
    // Fall back to the table when analytics is hidden so a stale/deep-linked
    // `studentsTab=analytics` URL doesn't render (or preload) a hidden tab.
    if (t === "analytics") return showAnalyticsTab ? "analytics" : "table";
    return "table";
  }, [searchParams, showAnalyticsTab]);

  const setStudentsSubTabInUrl = useCallback(
    (next: StudentsSubTab) => {
      const current = new URLSearchParams(searchParams.toString());
      current.delete("tab");
      current.delete("studentsTab");
      const ordered = new URLSearchParams();
      ordered.set("tab", "students");
      if (next !== "table") {
        ordered.set("studentsTab", next);
      }
      for (const [k, v] of current.entries()) {
        ordered.append(k, v);
      }
      router.replace(`${pathname}?${ordered.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const {
    loading,
    error,
    students,
    groups,
    groupCount,
    profileFields,
    studentProfilesMap,
    savedConfig,
    resolvedVisibility,
    displayFieldIds,
    filterFieldIds,
    filterableFields,
    progressStatsMap,
    pendingApprovalStudentIds,
    progressSummaryLoading,
    approvalsLoading,
    analyticsProgressLoading,
    refreshBase,
    saveTableConfig,
    ensureAnalyticsDataLoaded,
    buildGroupAnalyticsBuckets,
    buildProfileAnalyticsBuckets,
  } = useClassStudentsData({
    classData,
    isTeacher: isStaffTeacher,
  });

  useEffect(() => {
    if (activeStudentsTab !== "analytics") return;
    ensureAnalyticsDataLoaded();
  }, [activeStudentsTab, ensureAnalyticsDataLoaded]);

  const handleChangeGroup = useCallback((student: StudentWithInfo) => {
    setSelectedStudent(student);
    setChangeGroupDialogOpen(true);
  }, []);

  const handleViewIndividualProgress = useCallback(
    (student: StudentWithInfo) => {
      setIndividualProgressStudent(student);
      setIndividualProgressDialogOpen(true);
    },
    [],
  );

  const handleGroupChanged = () => {
    refreshBase();
  };

  const handleStudentDeleted = () => {
    refreshBase();
  };

  const handleDeleteStudent = useCallback((student: StudentWithInfo) => {
    setStudentToDelete(student);
    setDeleteStudentDialogOpen(true);
  }, []);

  const handleSaveConfig = useCallback(
    async (next: ProgressViewConfig) => {
      setSavingConfig(true);
      try {
        await saveTableConfig(next);
      } finally {
        setSavingConfig(false);
      }
    },
    [saveTableConfig],
  );

  const visibleDisplayFields = useMemo(() => {
    if (displayFieldIds.size === 0) return [];
    return profileFields.filter((f) => displayFieldIds.has(f.id));
  }, [profileFields, displayFieldIds]);

  const tableRows: SubmissionsTableRow[] = useMemo(() => {
    return students.map((s) => {
      const groupDisplayName = getStudentGroupLabel(s);
      const stats = progressStatsMap.get(s.student_id) ?? {
        completed: 0,
        total: 0,
        lastCompletedAt: null,
        status: "not_started" as const,
      };
      return {
        id: s.student_id,
        name: getStudentDisplayName(s),
        email: s.student_email,
        profileData: studentProfilesMap.get(s.student_id) ?? {},
        status: stats.status === "no_content" ? "not_started" : stats.status,
        data: {
          groupDisplayName,
          progressStats: stats,
          hasPendingApprovals: pendingApprovalStudentIds.has(s.student_id),
          _student: s,
          _groups: groups,
        },
      };
    });
  }, [
    students,
    studentProfilesMap,
    groups,
    progressStatsMap,
    pendingApprovalStudentIds,
  ]);

  const tableColumns: SubmissionsTableColumn[] = useMemo(() => {
    const columns: SubmissionsTableColumn[] = visibleDisplayFields.map(
      (field) => ({
        key: `profile_${field.id}`,
        label: field.field_name,
        render: (row) => (
          <span className="text-sm">
            {row.profileData?.[field.id]?.trim() ?? "—"}
          </span>
        ),
        sortValue: (row) => (row.profileData?.[field.id] ?? "").trim(),
      }),
    );

    if (resolvedVisibility.group) {
      columns.push({
        key: "group",
        label: STUDENT_COLUMN_META.group.label,
        render: (row) => (
          <span className="text-sm">
            {(row.data?.groupDisplayName as string) ?? "—"}
          </span>
        ),
        sortValue: (row) => (row.data?.groupDisplayName as string) ?? "",
      });
    }

    if (resolvedVisibility.progress) {
      columns.push({
        key: "progress",
        label: STUDENT_COLUMN_META.progress.label,
        render: (row) => {
          if (progressSummaryLoading) {
            return <span className="text-xs text-muted-foreground">…</span>;
          }
          const stats = row.data?.progressStats as ProgressStatsShape | undefined;
          if (!stats || stats.total === 0) {
            return (
              <span className="text-xs text-muted-foreground">No content</span>
            );
          }
          const pct = Math.round((stats.completed / stats.total) * 100);
          return (
            <div className="flex items-center gap-2 min-w-[140px]">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    pct >= 100
                      ? "bg-green-500"
                      : pct > 0
                        ? "bg-primary"
                        : "bg-muted"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {stats.completed}/{stats.total}
              </span>
            </div>
          );
        },
        sortValue: (row) => {
          const stats = row.data?.progressStats as ProgressStatsShape | undefined;
          if (!stats || stats.total === 0) return -1;
          return stats.completed / stats.total;
        },
      });
    }

    if (resolvedVisibility.lastCompleted) {
      columns.push({
        key: "last_completed",
        label: STUDENT_COLUMN_META.lastCompleted.label,
        render: (row) => {
          if (progressSummaryLoading) {
            return <span className="text-sm text-muted-foreground">…</span>;
          }
          const stats = row.data?.progressStats as ProgressStatsShape | undefined;
          if (!stats || !stats.lastCompletedAt) {
            return <span className="text-sm text-muted-foreground">—</span>;
          }
          return (
            <span className="text-sm">
              {new Date(stats.lastCompletedAt).toLocaleDateString()}
            </span>
          );
        },
        sortValue: (row) => {
          const stats = row.data?.progressStats as ProgressStatsShape | undefined;
          if (!stats || !stats.lastCompletedAt) return -1;
          return Date.parse(stats.lastCompletedAt);
        },
      });
    }

    if (resolvedVisibility.approvals) {
      columns.push({
        key: "pending_approval",
        label: STUDENT_COLUMN_META.approvals.label,
        render: (row) => {
          if (approvalsLoading) {
            return <span className="text-sm text-muted-foreground">…</span>;
          }
          return row.data?.hasPendingApprovals ? (
            <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              Pending
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          );
        },
        sortValue: (row) => (row.data?.hasPendingApprovals ? 0 : 1),
      });
    }

    columns.push({
      key: "actions",
      label: "",
      align: "right",
      sortable: false,
      render: (row) => {
        const student = row.data?._student as StudentWithInfo | undefined;
        const groupList = row.data?._groups as ClassGroup[] | undefined;
        if (!student) return null;
        return (
          <div className="flex items-center justify-end">
            <StudentListItemMenu
              student={student}
              groups={groupList ?? []}
              onViewProgress={handleViewIndividualProgress}
              onChangeGroup={handleChangeGroup}
              onDeleteStudent={handleDeleteStudent}
            />
          </div>
        );
      },
    });

    return columns;
  }, [
    visibleDisplayFields,
    resolvedVisibility,
    progressSummaryLoading,
    approvalsLoading,
    handleViewIndividualProgress,
    handleChangeGroup,
    handleDeleteStudent,
  ]);

  const csvColumns = useMemo(
    () =>
      getClassStudentsCsvColumnOptions(visibleDisplayFields, resolvedVisibility),
    [visibleDisplayFields, resolvedVisibility],
  );

  const handleConfirmCsvDownload = useCallback(
    (selectedIds: Set<string>) => {
      const csv = buildClassStudentsCsv(
        tableRows,
        visibleDisplayFields,
        resolvedVisibility,
        selectedIds,
      );
      const safeName = sanitizeFilenameSegment(classData.name, "class");
      const stamp = csvFilenameDateTime();
      downloadCsvFile(
        csv,
        `class-students-${classData.class_id}-${safeName}-${stamp}.csv`,
      );
    },
    [
      tableRows,
      visibleDisplayFields,
      resolvedVisibility,
      classData.class_id,
      classData.name,
    ],
  );

  const statusFilterOptions = useMemo(
    () =>
      resolvedVisibility.progress
        ? [
            { value: "complete", label: "All Complete" },
            { value: "in_progress", label: "In Progress" },
            { value: "not_started", label: "Not Started" },
          ]
        : [],
    [resolvedVisibility.progress],
  );

  const toolbarExtra = useMemo(
    () => (
      <>
        <StudentsTableConfigMenu
          profileFields={profileFields}
          savedConfig={savedConfig}
          visibility={resolvedVisibility}
          groupCount={groupCount}
          saving={savingConfig}
          onSave={handleSaveConfig}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={() => setCsvExportOpen(true)}
          disabled={students.length === 0}
          title="Download roster as CSV"
          aria-label="Download student table as CSV"
        >
          <Download className="h-4 w-4" />
        </Button>
      </>
    ),
    [
      profileFields,
      savedConfig,
      resolvedVisibility,
      groupCount,
      savingConfig,
      handleSaveConfig,
      students.length,
    ],
  );

  const studentsTable =
    students.length === 0 ? (
      <div className="text-center py-12 text-muted-foreground">
        <p>
          No students enrolled yet. Use the &apos;Invite Students&apos; button to
          generate an invite link.
        </p>
      </div>
    ) : (
      <SubmissionsTable
        columns={tableColumns}
        rows={tableRows}
        statusFilterOptions={statusFilterOptions}
        profileFields={profileFields}
        displayFieldIds={new Set()}
        filterFieldIds={filterFieldIds}
        profileFilterStorageKey={`class-students-filters-${classData.id}`}
        showUnlockColumn={false}
        emptyMessage="No students enrolled yet."
        searchPlaceholder="Search by student name..."
        toolbarEndExtra={toolbarExtra}
        wideColumnScroll
      />
    );

  return (
    <div className="py-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Students</h2>
        {isStaffTeacher && (
          <div className="flex gap-2">
            <Button onClick={() => setManageDialogOpen(true)}>
              Invite Students
            </Button>
          </div>
        )}
      </div>

      {!isStaffTeacher ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Only teachers on this class roster can view students.</p>
        </div>
      ) : loading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading students...</p>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-destructive">{error}</p>
        </div>
      ) : !showAnalyticsTab ? (
        studentsTable
      ) : (
        <Tabs
          value={activeStudentsTab}
          onValueChange={(v) => setStudentsSubTabInUrl(v as StudentsSubTab)}
          className="w-full overflow-visible"
        >
          <MutedPrimaryTabsList className="mb-4 h-auto w-auto gap-1 rounded-md p-1">
            <MutedPrimaryTabsTrigger
              value="table"
              className="rounded-sm px-4 py-2"
            >
              Roster
            </MutedPrimaryTabsTrigger>
            <MutedPrimaryTabsTrigger
              value="analytics"
              className="rounded-sm px-4 py-2"
            >
              Analytics
            </MutedPrimaryTabsTrigger>
          </MutedPrimaryTabsList>

          <TabsContent value="table" className="mt-0 overflow-visible">
            {studentsTable}
          </TabsContent>

          <TabsContent value="analytics" className="mt-0">
            <StudentsAnalyticsTab
              filterableFields={filterableFields}
              groupBuckets={buildGroupAnalyticsBuckets()}
              buildProfileBuckets={buildProfileAnalyticsBuckets}
              progressLoading={analyticsProgressLoading}
            />
          </TabsContent>
        </Tabs>
      )}

      <ManageStudentsDialog
        classData={classData}
        open={manageDialogOpen}
        onOpenChange={setManageDialogOpen}
      />

      <ChangeGroupDialog
        open={changeGroupDialogOpen}
        onOpenChange={setChangeGroupDialogOpen}
        student={selectedStudent}
        groups={groups}
        classDbId={classData.id}
        onGroupChanged={handleGroupChanged}
      />

      <DeleteStudentDialog
        open={deleteStudentDialogOpen}
        onOpenChange={(newOpen) => {
          setDeleteStudentDialogOpen(newOpen);
          if (!newOpen) setStudentToDelete(null);
        }}
        student={studentToDelete}
        classDbId={classData.id}
        onStudentDeleted={handleStudentDeleted}
      />

      <StudentIndividualProgressDialog
        open={individualProgressDialogOpen}
        onOpenChange={(newOpen) => {
          setIndividualProgressDialogOpen(newOpen);
          if (!newOpen) setIndividualProgressStudent(null);
        }}
        classDbId={classData.id}
        classRouteId={classData.class_id}
        student={individualProgressStudent}
      />

      <ClassStudentsCsvExportDialog
        open={csvExportOpen}
        onOpenChange={setCsvExportOpen}
        title="Download students (CSV)"
        columns={csvColumns}
        onDownload={handleConfirmCsvDownload}
      />
    </div>
  );
}
