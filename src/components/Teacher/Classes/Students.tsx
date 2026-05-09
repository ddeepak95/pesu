"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Class } from "@/types/class";
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
import StudentProgressDialog from "./StudentProgressDialog";
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
import ClassStudentsCsvExportDialog from "./ClassStudentsCsvExportDialog";
import {
  buildClassStudentsInfoCsv,
  buildClassStudentsProgressCsv,
  getInfoCsvColumnOptions,
  getProgressCsvColumnOptions,
} from "./classStudentsCsvColumns";

type StudentsSubTab = "info" | "progress" | "analytics";

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
}

export default function Students({ classData }: StudentsProps) {
  const router = useTrackedRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isOwner = user?.id === classData.created_by;
  // Only fetch co-teacher membership when the user isn't already the owner.
  const { data: isCoTeacher } = useIsCoTeacherForClass(
    !isOwner && user?.id ? classData.id : null,
    !isOwner ? (user?.id ?? null) : null,
  );
  const isTeacher = isOwner || isCoTeacher === true;
  const [manageDialogOpen, setManageDialogOpen] = useState(false);

  // Change group dialog state
  const [changeGroupDialogOpen, setChangeGroupDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] =
    useState<StudentWithInfo | null>(null);

  // Delete student dialog state
  const [deleteStudentDialogOpen, setDeleteStudentDialogOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] =
    useState<StudentWithInfo | null>(null);

  // Progress dialog state
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);

  // Individual progress dialog state
  const [individualProgressDialogOpen, setIndividualProgressDialogOpen] =
    useState(false);
  const [individualProgressStudent, setIndividualProgressStudent] =
    useState<StudentWithInfo | null>(null);

  const [infoCsvExportOpen, setInfoCsvExportOpen] = useState(false);
  const [progressCsvExportOpen, setProgressCsvExportOpen] = useState(false);

  const activeStudentsTab = useMemo((): StudentsSubTab => {
    const t = searchParams.get("studentsTab");
    if (t === "progress" || t === "analytics") return t;
    return "info";
  }, [searchParams]);

  const setStudentsSubTabInUrl = useCallback(
    (next: StudentsSubTab) => {
      const current = new URLSearchParams(searchParams.toString());
      current.delete("tab");
      current.delete("studentsTab");
      const ordered = new URLSearchParams();
      ordered.set("tab", "students");
      if (next !== "info") {
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
    progressLoading,
    error,
    students,
    groups,
    profileFields,
    studentProfilesMap,
    displayFieldIds,
    filterFieldIds,
    filterableFields,
    progressStatsMap,
    pendingApprovalStudentIds,
    refreshBase,
    ensureProgressDataLoaded,
    buildGroupAnalyticsBuckets,
    buildProfileAnalyticsBuckets,
  } = useClassStudentsData({
    classData,
    isTeacher,
  });

  useEffect(() => {
    if (activeStudentsTab !== "progress" && activeStudentsTab !== "analytics")
      return;
    ensureProgressDataLoaded();
  }, [activeStudentsTab, ensureProgressDataLoaded]);

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

  const tableRows: SubmissionsTableRow[] = useMemo(() => {
    return students.map((s) => {
      const groupDisplayName = getStudentGroupLabel(s);
      return {
        id: s.student_id,
        name: getStudentDisplayName(s),
        email: s.student_email,
        profileData: studentProfilesMap.get(s.student_id) ?? {},
        data: {
          groupDisplayName,
          _student: s,
          _groups: groups,
        },
      };
    });
  }, [students, studentProfilesMap, groups]);

  const visibleDisplayFields = useMemo(() => {
    if (displayFieldIds.size === 0) return [];
    return profileFields.filter((f) => displayFieldIds.has(f.id));
  }, [profileFields, displayFieldIds]);

  const infoCsvColumns = useMemo(
    () => getInfoCsvColumnOptions(visibleDisplayFields),
    [visibleDisplayFields],
  );
  const progressCsvColumns = useMemo(
    () => getProgressCsvColumnOptions(visibleDisplayFields),
    [visibleDisplayFields],
  );

  const tableColumns: SubmissionsTableColumn[] = useMemo(() => {
    const profileColumns: SubmissionsTableColumn[] = visibleDisplayFields.map(
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
    return [
      ...profileColumns,
      {
        key: "group",
        label: "Group",
        render: (row) => (
          <span className="text-sm">
            {(row.data?.groupDisplayName as string) ?? "—"}
          </span>
        ),
        sortValue: (row) => (row.data?.groupDisplayName as string) ?? "",
      },
      {
        key: "actions",
        label: "Actions",
        align: "right",
        sortable: false,
        render: (row) => {
          const student = row.data?._student as StudentWithInfo | undefined;
          const groupList = row.data?._groups as ClassGroup[] | undefined;
          if (!student) return null;
          return (
            <div className="flex items-center justify-end gap-2">
              {false && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    handleViewIndividualProgress(student as StudentWithInfo)
                  }
                >
                  View progress
                </Button>
              )}
              <StudentListItemMenu
                student={student}
                groups={groupList ?? []}
                onChangeGroup={handleChangeGroup}
                onDeleteStudent={handleDeleteStudent}
              />
            </div>
          );
        },
      },
    ];
  }, [
    handleChangeGroup,
    handleViewIndividualProgress,
    handleDeleteStudent,
    visibleDisplayFields,
  ]);

  const progressTableRows: SubmissionsTableRow[] = useMemo(() => {
    return students.map((s) => {
      const groupDisplayName = getStudentGroupLabel(s);
      const stats = progressStatsMap.get(s.student_id) ?? {
        completed: 0,
        total: 0,
        lastCompletedAt: null,
        status: "not_started",
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

  const progressTableColumns: SubmissionsTableColumn[] = useMemo(() => {
    const profileColumns: SubmissionsTableColumn[] = visibleDisplayFields.map(
      (field) => ({
        key: `profile_${field.id}`,
        label: field.field_name,
        render: (row: SubmissionsTableRow) => (
          <span className="text-sm">
            {row.profileData?.[field.id]?.trim() ?? "—"}
          </span>
        ),
        sortValue: (row: SubmissionsTableRow) =>
          (row.profileData?.[field.id] ?? "").trim(),
      }),
    );
    return [
      ...profileColumns,
      {
        key: "group",
        label: "Group",
        render: (row: SubmissionsTableRow) => (
          <span className="text-sm">
            {(row.data?.groupDisplayName as string) ?? "—"}
          </span>
        ),
        sortValue: (row: SubmissionsTableRow) =>
          (row.data?.groupDisplayName as string) ?? "",
      },
      {
        key: "progress",
        label: "Progress",
        render: (row: SubmissionsTableRow) => {
          const stats = row.data?.progressStats as
            | {
                completed: number;
                total: number;
                lastCompletedAt: string | null;
              }
            | undefined;
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
        sortValue: (row: SubmissionsTableRow) => {
          const stats = row.data?.progressStats as
            | {
                completed: number;
                total: number;
                lastCompletedAt: string | null;
              }
            | undefined;
          if (!stats || stats.total === 0) return -1;
          return stats.completed / stats.total;
        },
      },
      {
        key: "last_completed",
        label: "Last completed",
        render: (row: SubmissionsTableRow) => {
          const stats = row.data?.progressStats as
            | {
                completed: number;
                total: number;
                lastCompletedAt: string | null;
              }
            | undefined;
          if (!stats || !stats.lastCompletedAt) {
            return <span className="text-sm text-muted-foreground">—</span>;
          }
          return (
            <span className="text-sm">
              {new Date(stats.lastCompletedAt).toLocaleDateString()}
            </span>
          );
        },
        sortValue: (row: SubmissionsTableRow) => {
          const stats = row.data?.progressStats as
            | {
                completed: number;
                total: number;
                lastCompletedAt: string | null;
              }
            | undefined;
          if (!stats || !stats.lastCompletedAt) return -1;
          return Date.parse(stats.lastCompletedAt);
        },
      },
      {
        key: "pending_approval",
        label: "Approvals",
        render: (row: SubmissionsTableRow) =>
          row.data?.hasPendingApprovals ? (
            <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              Pending
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          ),
        sortValue: (row: SubmissionsTableRow) =>
          row.data?.hasPendingApprovals ? 0 : 1,
      },
      {
        key: "actions",
        label: "",
        align: "right" as const,
        sortable: false,
        render: (row: SubmissionsTableRow) => {
          const student = row.data?._student as StudentWithInfo | undefined;
          if (!student) return null;
          return (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleViewIndividualProgress(student)}
            >
              View details
            </Button>
          );
        },
      },
    ];
  }, [handleViewIndividualProgress, visibleDisplayFields]);

  const handleConfirmInfoCsvDownload = useCallback(
    (selectedIds: Set<string>) => {
      const csv = buildClassStudentsInfoCsv(
        tableRows,
        visibleDisplayFields,
        selectedIds,
      );
      const safeName = sanitizeFilenameSegment(classData.name, "class");
      const stamp = csvFilenameDateTime();
      downloadCsvFile(
        csv,
        `class-students-info-${classData.class_id}-${safeName}-${stamp}.csv`,
      );
    },
    [tableRows, visibleDisplayFields, classData.class_id, classData.name],
  );

  const handleConfirmProgressCsvDownload = useCallback(
    (selectedIds: Set<string>) => {
      const csv = buildClassStudentsProgressCsv(
        progressTableRows,
        visibleDisplayFields,
        selectedIds,
      );
      const safeName = sanitizeFilenameSegment(classData.name, "class");
      const stamp = csvFilenameDateTime();
      downloadCsvFile(
        csv,
        `class-students-progress-${classData.class_id}-${safeName}-${stamp}.csv`,
      );
    },
    [
      progressTableRows,
      visibleDisplayFields,
      classData.class_id,
      classData.name,
    ],
  );

  const infoToolbarExtra = useMemo(
    () => (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 shrink-0"
        onClick={() => setInfoCsvExportOpen(true)}
        disabled={students.length === 0}
        title="Download roster as CSV"
        aria-label="Download student info table as CSV"
      >
        <Download className="h-4 w-4" />
      </Button>
    ),
    [students.length],
  );

  const progressToolbarExtra = useMemo(
    () => (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 shrink-0"
        onClick={() => setProgressCsvExportOpen(true)}
        disabled={students.length === 0}
        title="Download progress as CSV"
        aria-label="Download student progress table as CSV"
      >
        <Download className="h-4 w-4" />
      </Button>
    ),
    [students.length],
  );

  return (
    <div className="py-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Students</h2>
        {isTeacher && (
          <div className="flex gap-2">
            {false && (
              <Button
                variant="outline"
                onClick={() => setProgressDialogOpen(true)}
              >
                View Student Progress
              </Button>
            )}
            <Button onClick={() => setManageDialogOpen(true)}>
              Invite Students
            </Button>
          </div>
        )}
      </div>

      {!isTeacher ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Only class owners and co-teachers can view students.</p>
        </div>
      ) : loading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading students...</p>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-destructive">{error}</p>
        </div>
      ) : (
        <Tabs
          value={activeStudentsTab}
          onValueChange={(v) => setStudentsSubTabInUrl(v as StudentsSubTab)}
          className="w-full overflow-visible"
        >
          <MutedPrimaryTabsList className="mb-4 h-auto w-auto gap-1 rounded-md p-1">
            <MutedPrimaryTabsTrigger
              value="info"
              className="rounded-sm px-4 py-2"
            >
              Info
            </MutedPrimaryTabsTrigger>
            <MutedPrimaryTabsTrigger
              value="progress"
              className="rounded-sm px-4 py-2"
            >
              Progress
            </MutedPrimaryTabsTrigger>
            <MutedPrimaryTabsTrigger
              value="analytics"
              className="rounded-sm px-4 py-2"
            >
              Analytics
            </MutedPrimaryTabsTrigger>
          </MutedPrimaryTabsList>

          <TabsContent value="info" className="mt-0 overflow-visible">
            {students.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>
                  No students enrolled yet. Use the &apos;Invite Students&apos;
                  button to generate an invite link.
                </p>
              </div>
            ) : (
              <SubmissionsTable
                columns={tableColumns}
                rows={tableRows}
                statusFilterOptions={[]}
                profileFields={profileFields}
                displayFieldIds={new Set()}
                filterFieldIds={filterFieldIds}
                profileFilterStorageKey={`class-students-filters-${classData.id}`}
                showUnlockColumn={false}
                emptyMessage="No students enrolled yet."
                searchPlaceholder="Search by student name..."
                toolbarEndExtra={infoToolbarExtra}
                wideColumnScroll
              />
            )}
          </TabsContent>

          <TabsContent value="progress" className="mt-0 overflow-visible">
            {progressLoading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  Loading progress data...
                </p>
              </div>
            ) : students.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No students enrolled yet.</p>
              </div>
            ) : (
              <SubmissionsTable
                columns={progressTableColumns}
                rows={progressTableRows}
                statusFilterOptions={[
                  { value: "complete", label: "All Complete" },
                  { value: "in_progress", label: "In Progress" },
                  { value: "not_started", label: "Not Started" },
                ]}
                profileFields={profileFields}
                displayFieldIds={new Set()}
                filterFieldIds={filterFieldIds}
                profileFilterStorageKey={`class-students-filters-${classData.id}`}
                showUnlockColumn={false}
                emptyMessage="No students enrolled yet."
                searchPlaceholder="Search by student name..."
                toolbarEndExtra={progressToolbarExtra}
                wideColumnScroll
              />
            )}
          </TabsContent>

          <TabsContent value="analytics" className="mt-0">
            <StudentsAnalyticsTab
              filterableFields={filterableFields}
              groupBuckets={buildGroupAnalyticsBuckets()}
              buildProfileBuckets={buildProfileAnalyticsBuckets}
              progressLoading={progressLoading}
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

      <StudentProgressDialog
        open={progressDialogOpen}
        onOpenChange={setProgressDialogOpen}
        classDbId={classData.id}
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
        open={infoCsvExportOpen}
        onOpenChange={setInfoCsvExportOpen}
        title="Download student info (CSV)"
        columns={infoCsvColumns}
        onDownload={handleConfirmInfoCsvDownload}
      />
      <ClassStudentsCsvExportDialog
        open={progressCsvExportOpen}
        onOpenChange={setProgressCsvExportOpen}
        title="Download student progress (CSV)"
        columns={progressCsvColumns}
        onDownload={handleConfirmProgressCsvDownload}
      />
    </div>
  );
}
