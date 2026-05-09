"use client";

import { useCallback, useMemo, useState } from "react";
import { mutate } from "swr";
import { Class } from "@/types/class";
import { StudentWithInfo } from "@/lib/queries/students";
import { ClassGroup } from "@/lib/queries/groups";
import { ProfileField } from "@/types/profileFields";
import {
  useAllStudentProfiles,
  useClassGroups,
  useClassStudents,
  useClassStudentProgressSummary,
  useProfileFieldsForClass,
  useProgressViewConfig,
  useStudentIdsPendingApprovalsByClass,
} from "@/hooks/swr";

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
  progressLoading: boolean;
  error: string | null;
  students: StudentWithInfo[];
  groups: ClassGroup[];
  profileFields: ProfileField[];
  studentProfilesMap: Map<string, Record<string, string>>;
  displayFieldIds: Set<string>;
  filterFieldIds: Set<string>;
  filterableFields: ProfileField[];
  progressLoaded: boolean;
  progressStatsMap: Map<string, StudentProgressStats>;
  /** Students with any assignment awaiting approval (Progress tab only). */
  pendingApprovalStudentIds: Set<string>;
  refreshBase: () => Promise<void>;
  ensureProgressDataLoaded: () => Promise<void>;
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

  const [progressEnabled, setProgressEnabled] = useState(false);
  const progressSummaryQuery = useClassStudentProgressSummary(
    classDbId,
    progressEnabled
  );
  const pendingApprovalsQuery = useStudentIdsPendingApprovalsByClass(
    classDbId,
    progressEnabled
  );

  // Reset on-demand progress when the class changes. Using the
  // "store information from previous render" pattern instead of an effect
  // avoids cascading renders flagged by `react-hooks/set-state-in-effect`.
  const [trackedClassId, setTrackedClassId] = useState(classData.id);
  if (trackedClassId !== classData.id) {
    setTrackedClassId(classData.id);
    setProgressEnabled(false);
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

  const savedConfig = skipProgressView
    ? classData.progress_view_config ?? null
    : progressViewQuery.data ?? null;

  const displayFieldIds = useMemo(
    () => new Set(savedConfig?.display_fields ?? []),
    [savedConfig]
  );
  const filterFieldIds = useMemo(
    () => new Set(savedConfig?.filter_fields ?? []),
    [savedConfig]
  );

  const progressLoaded =
    progressEnabled &&
    progressSummaryQuery.data !== undefined &&
    !pendingApprovalsQuery.isLoading;
  const progressLoading =
    progressEnabled &&
    (progressSummaryQuery.isLoading || pendingApprovalsQuery.isLoading);

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
      progressEnabled
        ? Promise.all([
            progressSummaryQuery.mutate(),
            pendingApprovalsQuery.mutate(),
          ])
        : Promise.resolve(),
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
    progressEnabled,
    skipProgressView,
  ]);

  const ensureProgressDataLoaded = useCallback(async () => {
    if (!isTeacher) return;
    setProgressEnabled(true);
    // If already enabled and cached, the SWR call is a no-op revalidation.
    await Promise.all([
      mutate(["classStudentProgressSummary", classData.id]),
      mutate(["studentIdsPendingApprovalsByClass", classData.id]),
    ]);
  }, [classData.id, isTeacher]);

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
    progressLoading,
    error: baseError ? "Failed to load students." : null,
    students,
    groups,
    profileFields,
    studentProfilesMap,
    displayFieldIds,
    filterFieldIds,
    filterableFields,
    progressLoaded,
    progressStatsMap,
    pendingApprovalStudentIds,
    refreshBase,
    ensureProgressDataLoaded,
    buildGroupAnalyticsBuckets,
    buildProfileAnalyticsBuckets,
  };
}
