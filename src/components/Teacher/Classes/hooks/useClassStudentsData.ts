"use client";

import { useCallback, useMemo, useState } from "react";
import { Class, ProgressViewConfig } from "@/types/class";
import { StudentWithInfo } from "@/lib/queries/students";
import { ClassGroup } from "@/lib/queries/groups";
import { ProfileField } from "@/types/profileFields";
import { saveProgressViewConfig } from "@/lib/queries/classes";
import {
  useAllStudentProfiles,
  useClassGroups,
  useClassStudents,
  useClassStudentProgressSummary,
  useProfileFieldsForClass,
  useProgressViewConfig,
  useStudentIdsPendingApprovalsByClass,
} from "@/hooks/swr";
import {
  needsPendingApprovals,
  needsProgressSummary,
  resolveColumnVisibility,
  type ResolvedColumnVisibility,
} from "../studentsTableConfig";

export type StudentProgressStatus =
  | "complete"
  | "in_progress"
  | "not_started"
  | "no_content";

export interface StudentProgressStats {
  completed: number;
  total: number;
  lastCompletedAt: string | null;
  status: StudentProgressStatus;
}

export interface StudentsAnalyticsBucket {
  key: string;
  label: string;
  studentIds: string[];
  totalStudents: number;
  completed: number;
  inProgress: number;
  notStarted: number;
}

interface UseClassStudentsDataProps {
  classData: Class;
  isTeacher: boolean;
}

interface UseClassStudentsDataReturn {
  loading: boolean;
  error: string | null;
  students: StudentWithInfo[];
  groups: ClassGroup[];
  groupCount: number;
  profileFields: ProfileField[];
  studentProfilesMap: Map<string, Record<string, string>>;
  savedConfig: ProgressViewConfig | null;
  /** Resolved built-in column visibility (config + group count). */
  resolvedVisibility: ResolvedColumnVisibility;
  displayFieldIds: Set<string>;
  filterFieldIds: Set<string>;
  filterableFields: ProfileField[];
  progressStatsMap: Map<string, StudentProgressStats>;
  /** Students with any assignment awaiting approval. */
  pendingApprovalStudentIds: Set<string>;
  /** True while the progress-summary RPC is loading (an enabled column needs it). */
  progressSummaryLoading: boolean;
  /** True while the pending-approvals query is loading (Approvals column needs it). */
  approvalsLoading: boolean;
  /** Progress-summary loading state relevant to the Analytics tab. */
  analyticsProgressLoading: boolean;
  refreshBase: () => Promise<void>;
  /** Persist the Table Config (class-level, shared across co-teachers). */
  saveTableConfig: (next: ProgressViewConfig) => Promise<void>;
  /** Trigger the progress-summary fetch the Analytics tab needs. */
  ensureAnalyticsDataLoaded: () => void;
  buildGroupAnalyticsBuckets: () => StudentsAnalyticsBucket[];
  buildProfileAnalyticsBuckets: (fieldId: string) => StudentsAnalyticsBucket[];
}

export const getStudentGroupLabel = (student: StudentWithInfo) => {
  return (
    student.group_name ||
    (student.group_index !== null ? `Group ${student.group_index + 1}` : "No group")
  );
};

export function useClassStudentsData({
  classData,
  isTeacher,
}: UseClassStudentsDataProps): UseClassStudentsDataReturn {
  const classDbId = isTeacher ? classData.id : null;

  const studentsQuery = useClassStudents(classDbId);
  const groupsQuery = useClassGroups(classDbId);
  const profileFieldsQuery = useProfileFieldsForClass(classDbId);
  const profilesQuery = useAllStudentProfiles(classDbId);
  // Skip the fetch if the parent already passed a config (it's also stored on
  // the Class row).
  const skipProgressView = classData.progress_view_config != null;
  const progressViewQuery = useProgressViewConfig(
    skipProgressView ? null : classDbId
  );

  // Optimistic override applied after the teacher edits the Table Config, so the
  // UI (and the fetch gates below) react before the DB round-trip resolves.
  const [configOverride, setConfigOverride] = useState<ProgressViewConfig | null>(
    null
  );
  // The Analytics tab needs progress data regardless of which table columns are
  // enabled; this gate is flipped when that tab opens.
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);

  // Reset on-demand state when the class changes. Using the "store information
  // from previous render" pattern instead of an effect avoids cascading renders
  // flagged by `react-hooks/set-state-in-effect`.
  const [trackedClassId, setTrackedClassId] = useState(classData.id);
  if (trackedClassId !== classData.id) {
    setTrackedClassId(classData.id);
    setConfigOverride(null);
    setAnalyticsEnabled(false);
  }

  const baseError =
    studentsQuery.error ||
    groupsQuery.error ||
    profileFieldsQuery.error ||
    profilesQuery.error ||
    progressViewQuery.error;

  const loading =
    isTeacher &&
    (studentsQuery.isLoading ||
      groupsQuery.isLoading ||
      profileFieldsQuery.isLoading ||
      profilesQuery.isLoading ||
      (!skipProgressView && progressViewQuery.isLoading));

  const students = useMemo(() => studentsQuery.data ?? [], [studentsQuery.data]);
  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);
  const profileFields = useMemo(
    () => profileFieldsQuery.data ?? [],
    [profileFieldsQuery.data]
  );

  const studentProfilesMap = useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    (profilesQuery.data ?? []).forEach((p) => {
      map.set(p.student_id, p.field_responses);
    });
    return map;
  }, [profilesQuery.data]);

  const savedConfig =
    configOverride ??
    (skipProgressView
      ? classData.progress_view_config ?? null
      : progressViewQuery.data ?? null);

  const displayFieldIds = useMemo(
    () => new Set(savedConfig?.display_fields ?? []),
    [savedConfig]
  );
  const filterFieldIds = useMemo(
    () => new Set(savedConfig?.filter_fields ?? []),
    [savedConfig]
  );

  const resolvedVisibility = useMemo(
    () => resolveColumnVisibility(savedConfig, groups.length),
    [savedConfig, groups.length]
  );

  // Config-driven fetch gates: each heavy query runs only when an enabled column
  // (or the Analytics tab, for the summary) actually needs its data.
  const wantsProgressSummary =
    needsProgressSummary(resolvedVisibility) || analyticsEnabled;
  const wantsPendingApprovals = needsPendingApprovals(resolvedVisibility);

  const progressSummaryQuery = useClassStudentProgressSummary(
    classDbId,
    wantsProgressSummary
  );
  const pendingApprovalsQuery = useStudentIdsPendingApprovalsByClass(
    classDbId,
    wantsPendingApprovals
  );

  const progressSummaryLoading =
    wantsProgressSummary && progressSummaryQuery.isLoading;
  const approvalsLoading =
    wantsPendingApprovals && pendingApprovalsQuery.isLoading;
  const analyticsProgressLoading =
    analyticsEnabled && progressSummaryQuery.isLoading;

  const pendingApprovalStudentIds = useMemo(
    () => new Set(pendingApprovalsQuery.data ?? []),
    [pendingApprovalsQuery.data]
  );

  const refreshBase = useCallback(async () => {
    if (!isTeacher) return;
    await Promise.all([
      studentsQuery.mutate(),
      groupsQuery.mutate(),
      profileFieldsQuery.mutate(),
      profilesQuery.mutate(),
      skipProgressView ? Promise.resolve() : progressViewQuery.mutate(),
      wantsProgressSummary ? progressSummaryQuery.mutate() : Promise.resolve(),
      wantsPendingApprovals ? pendingApprovalsQuery.mutate() : Promise.resolve(),
    ]);
  }, [
    isTeacher,
    studentsQuery,
    groupsQuery,
    profileFieldsQuery,
    profilesQuery,
    progressViewQuery,
    progressSummaryQuery,
    pendingApprovalsQuery,
    wantsProgressSummary,
    wantsPendingApprovals,
    skipProgressView,
  ]);

  const saveTableConfig = useCallback(
    async (next: ProgressViewConfig) => {
      if (!isTeacher) return;
      setConfigOverride(next);
      await saveProgressViewConfig(classData.id, next);
      if (!skipProgressView) await progressViewQuery.mutate();
    },
    [isTeacher, classData.id, skipProgressView, progressViewQuery]
  );

  const ensureAnalyticsDataLoaded = useCallback(() => {
    if (!isTeacher) return;
    setAnalyticsEnabled(true);
  }, [isTeacher]);

  const filterableFields = useMemo(() => {
    if (filterFieldIds.size === 0) return [];
    return profileFields.filter(
      (f) =>
        filterFieldIds.has(f.id) &&
        f.field_type === "dropdown" &&
        f.options &&
        f.options.length > 0,
    );
  }, [profileFields, filterFieldIds]);

  const progressStatsMap = useMemo(() => {
    const statsMap = new Map<string, StudentProgressStats>();
    const summaryRows = progressSummaryQuery.data ?? [];
    const summaryByStudent = new Map(
      summaryRows.map((row) => [row.student_id, row])
    );

    students.forEach((student) => {
      const row = summaryByStudent.get(student.student_id);
      const total = row?.total ?? 0;
      const completed = row?.completed ?? 0;
      const lastCompletedAt = row?.last_completed_at ?? null;

      const status: StudentProgressStatus =
        total === 0
          ? "no_content"
          : completed >= total
            ? "complete"
            : completed > 0
              ? "in_progress"
              : "not_started";

      statsMap.set(student.student_id, {
        completed,
        total,
        lastCompletedAt,
        status,
      });
    });

    return statsMap;
  }, [progressSummaryQuery.data, students]);

  const buildStudentsBucket = useCallback(
    (key: string, label: string, bucketStudents: StudentWithInfo[]) => {
      let completed = 0;
      let inProgress = 0;
      let notStarted = 0;

      bucketStudents.forEach((student) => {
        const status = progressStatsMap.get(student.student_id)?.status ?? "not_started";
        if (status === "complete") completed += 1;
        else if (status === "in_progress") inProgress += 1;
        else notStarted += 1;
      });

      return {
        key,
        label,
        studentIds: bucketStudents.map((student) => student.student_id),
        totalStudents: bucketStudents.length,
        completed,
        inProgress,
        notStarted,
      };
    },
    [progressStatsMap],
  );

  const buildGroupAnalyticsBuckets = useCallback(() => {
    const studentsByGroup = new Map<string, StudentWithInfo[]>();
    students.forEach((student) => {
      const groupLabel = getStudentGroupLabel(student);
      if (!studentsByGroup.has(groupLabel)) studentsByGroup.set(groupLabel, []);
      studentsByGroup.get(groupLabel)?.push(student);
    });

    return Array.from(studentsByGroup.entries())
      .map(([groupLabel, groupStudents]) =>
        buildStudentsBucket(groupLabel, groupLabel, groupStudents),
      )
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [buildStudentsBucket, students]);

  const buildProfileAnalyticsBuckets = useCallback(
    (fieldId: string) => {
      const field = profileFields.find((item) => item.id === fieldId);
      if (!field) return [];

      const studentsByOption = new Map<string, StudentWithInfo[]>();
      (field.options ?? []).forEach((option) => studentsByOption.set(option, []));
      studentsByOption.set("(Not set)", []);

      students.forEach((student) => {
        const profileValue = studentProfilesMap.get(student.student_id)?.[fieldId];
        const normalizedValue = profileValue?.trim();
        if (!normalizedValue) {
          studentsByOption.get("(Not set)")?.push(student);
          return;
        }
        if (!studentsByOption.has(normalizedValue)) {
          studentsByOption.set(normalizedValue, []);
        }
        studentsByOption.get(normalizedValue)?.push(student);
      });

      return Array.from(studentsByOption.entries()).map(([label, bucketStudents]) =>
        buildStudentsBucket(`${fieldId}:${label}`, label, bucketStudents),
      );
    },
    [buildStudentsBucket, profileFields, studentProfilesMap, students],
  );

  return {
    loading: !!loading,
    error: baseError ? "Failed to load students." : null,
    students,
    groups,
    groupCount: groups.length,
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
  };
}
