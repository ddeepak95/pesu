"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Class } from "@/types/class";
import {
  StudentWithInfo,
  getClassStudentsWithInfo,
} from "@/lib/queries/students";
import { ClassGroup, getClassGroups } from "@/lib/queries/groups";
import {
  getAllStudentProfiles,
  getProfileFieldsForClass,
} from "@/lib/queries/profileFields";
import { getProgressViewConfig } from "@/lib/queries/classes";
import { ProfileField } from "@/types/profileFields";
import { getClassContentCompletions } from "@/lib/queries/contentCompletions";
import { StudentContentCompletionWithDetails } from "@/types/contentCompletion";

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
  progressData: StudentContentCompletionWithDetails[];
  progressLoaded: boolean;
  progressStatsMap: Map<string, StudentProgressStats>;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentWithInfo[]>([]);
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [profileFields, setProfileFields] = useState<ProfileField[]>([]);
  const [studentProfilesMap, setStudentProfilesMap] = useState<
    Map<string, Record<string, string>>
  >(new Map());
  const [displayFieldIds, setDisplayFieldIds] = useState<Set<string>>(new Set());
  const [filterFieldIds, setFilterFieldIds] = useState<Set<string>>(new Set());

  const [progressData, setProgressData] = useState<
    StudentContentCompletionWithDetails[]
  >([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressLoaded, setProgressLoaded] = useState(false);

  const fetchBaseData = useCallback(async () => {
    if (!isTeacher) {
      setLoading(false);
      setStudents([]);
      setGroups([]);
      setProfileFields([]);
      setStudentProfilesMap(new Map());
      setDisplayFieldIds(new Set());
      setFilterFieldIds(new Set());
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [studentsData, groupsData, fields, profiles, savedConfig] =
        await Promise.all([
          getClassStudentsWithInfo(classData.id),
          getClassGroups(classData.id),
          getProfileFieldsForClass(classData.id),
          getAllStudentProfiles(classData.id),
          classData.progress_view_config != null
            ? Promise.resolve(classData.progress_view_config)
            : getProgressViewConfig(classData.id),
        ]);

      setStudents(studentsData);
      setGroups(groupsData);
      setProfileFields(fields);

      const profilesMap = new Map<string, Record<string, string>>();
      profiles.forEach((p) => {
        profilesMap.set(p.student_id, p.field_responses);
      });
      setStudentProfilesMap(profilesMap);

      setDisplayFieldIds(new Set(savedConfig?.display_fields ?? []));
      setFilterFieldIds(new Set(savedConfig?.filter_fields ?? []));
    } catch (err) {
      console.error("Error fetching students:", err);
      setError("Failed to load students.");
    } finally {
      setLoading(false);
    }
  }, [classData.id, classData.progress_view_config, isTeacher]);

  const ensureProgressDataLoaded = useCallback(async () => {
    if (!isTeacher || progressLoaded || progressLoading) return;

    setProgressLoading(true);
    try {
      const completions = await getClassContentCompletions(classData.id);
      setProgressData(completions);
      setProgressLoaded(true);
    } catch (err) {
      console.error("Error fetching progress data:", err);
    } finally {
      setProgressLoading(false);
    }
  }, [classData.id, isTeacher, progressLoaded, progressLoading]);

  useEffect(() => {
    fetchBaseData();
  }, [fetchBaseData]);

  useEffect(() => {
    setProgressData([]);
    setProgressLoaded(false);
    setProgressLoading(false);
  }, [classData.id]);

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
    if (students.length === 0) return statsMap;

    const contentByGroup = new Map<string, Set<string>>();
    progressData.forEach((item) => {
      const groupId = item.contentGroupId ?? "__none__";
      if (!contentByGroup.has(groupId)) contentByGroup.set(groupId, new Set());
      contentByGroup.get(groupId)?.add(item.contentItemId);
    });

    const studentCompletions = new Map<string, Set<string>>();
    const studentCompletionDates = new Map<string, Map<string, string>>();
    progressData.forEach((item) => {
      if (!item.isComplete) return;

      if (!studentCompletions.has(item.studentId)) {
        studentCompletions.set(item.studentId, new Set());
      }
      studentCompletions.get(item.studentId)?.add(item.contentItemId);

      if (item.completedAt) {
        if (!studentCompletionDates.has(item.studentId)) {
          studentCompletionDates.set(item.studentId, new Map<string, string>());
        }
        studentCompletionDates.get(item.studentId)?.set(item.contentItemId, item.completedAt);
      }
    });

    students.forEach((student) => {
      const groupId = student.group_id ?? "__none__";
      const groupContentIds = contentByGroup.get(groupId);
      const total = groupContentIds?.size ?? 0;
      const completedIds = studentCompletions.get(student.student_id);
      const completionDatesByContent = studentCompletionDates.get(student.student_id);
      let completed = 0;
      let lastCompletedAt: string | null = null;

      if (completedIds && groupContentIds) {
        groupContentIds.forEach((contentId) => {
          if (completedIds.has(contentId)) completed += 1;
          const completedAt = completionDatesByContent?.get(contentId);
          if (
            completedAt &&
            (!lastCompletedAt || Date.parse(completedAt) > Date.parse(lastCompletedAt))
          ) {
            lastCompletedAt = completedAt;
          }
        });
      }

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
  }, [progressData, students]);

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
    progressData,
    progressLoaded,
    progressStatsMap,
    refreshBase: fetchBaseData,
    ensureProgressDataLoaded,
    buildGroupAnalyticsBuckets,
    buildProfileAnalyticsBuckets,
  };
}
