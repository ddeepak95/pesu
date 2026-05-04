"use client";

import { useMemo } from "react";
import { getStudentDisplayName } from "@/lib/utils/displayName";
import {
  unlockContentForStudent,
  lockContentForStudent,
} from "@/lib/queries/teacherUnlocks";
import { ContentItemType } from "@/types/contentItem";
import SubmissionsTable, {
  SubmissionsTableColumn,
  SubmissionsTableRow,
} from "./SubmissionsTable";
import {
  invalidateTeacherUnlocksCache,
  useAllStudentProfiles,
  useClassData,
  useClassStudents,
  useContentItemByRefId,
  useProfileFieldsForClass,
  useProgressViewConfig,
  useTeacherUnlocksForContentItem,
} from "@/hooks/swr";

interface StudentUnlockTabProps {
  /** UUID of the underlying entity (survey.id, learning_content.id, etc.) */
  refId: string;
  /** Content item type */
  contentType: ContentItemType;
  /** Short class_id from URL (for getClassByClassId) */
  classId: string;
  /** Content name for the unlock dialog */
  contentName: string;
  /** When the same material is linked across groups, disambiguate the placement. */
  placementGroupId?: string | null;
}

export default function StudentUnlockTab({
  refId,
  contentType,
  classId,
  contentName,
  placementGroupId,
}: StudentUnlockTabProps) {
  const classQuery = useClassData(classId);
  const classDbId = classQuery.data?.id ?? null;

  const studentsQuery = useClassStudents(classDbId);
  const profileFieldsQuery = useProfileFieldsForClass(classDbId);
  const profilesQuery = useAllStudentProfiles(classDbId);
  const progressViewQuery = useProgressViewConfig(classDbId);
  const contentItemQuery = useContentItemByRefId(refId, contentType, placementGroupId);

  const contentItem = contentItemQuery.data ?? null;
  const requireTeacherUnlock = !!contentItem?.require_teacher_unlock;

  const unlocksQuery = useTeacherUnlocksForContentItem(
    requireTeacherUnlock ? contentItem?.id ?? null : null
  );

  const students = useMemo(
    () => studentsQuery.data ?? [],
    [studentsQuery.data]
  );
  const profileFields = useMemo(
    () => profileFieldsQuery.data ?? [],
    [profileFieldsQuery.data]
  );
  const studentProfilesMap = useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    (profilesQuery.data ?? []).forEach((p) =>
      map.set(p.student_id, p.field_responses)
    );
    return map;
  }, [profilesQuery.data]);
  const displayFieldIds = useMemo(
    () => new Set(progressViewQuery.data?.display_fields ?? []),
    [progressViewQuery.data]
  );
  const filterFieldIds = useMemo(
    () => new Set(progressViewQuery.data?.filter_fields ?? []),
    [progressViewQuery.data]
  );
  const unlockedStudentIds = useMemo(
    () => new Set((unlocksQuery.data ?? []).map((u) => u.student_id)),
    [unlocksQuery.data]
  );

  const loading =
    classQuery.isLoading ||
    studentsQuery.isLoading ||
    profileFieldsQuery.isLoading ||
    profilesQuery.isLoading ||
    progressViewQuery.isLoading ||
    contentItemQuery.isLoading;
  const error =
    !classQuery.isLoading && classDbId === null
      ? "Class not found"
      : classQuery.error ||
          studentsQuery.error ||
          profileFieldsQuery.error ||
          profilesQuery.error ||
          progressViewQuery.error ||
          contentItemQuery.error
        ? "Failed to load student data."
        : null;

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

  const columns: SubmissionsTableColumn[] = useMemo(() => {
    return [
      {
        key: "joined",
        label: "Joined",
        render: (row) => (
          <div className="text-sm text-muted-foreground">
            {row.data?.joinedAt
              ? new Date(row.data.joinedAt as string).toLocaleDateString()
              : "-"}
          </div>
        ),
        sortValue: (row) =>
          row.data?.joinedAt
            ? new Date(row.data.joinedAt as string).getTime()
            : 0,
      },
    ];
  }, []);

  const rows: SubmissionsTableRow[] = useMemo(() => {
    return students.map((student) => ({
      id: student.student_id,
      name: getStudentDisplayName(student),
      email: student.student_email,
      profileData: studentProfilesMap.get(student.student_id) ?? {},
      isUnlocked: unlockedStudentIds.has(student.student_id),
      data: {
        joinedAt: student.joined_at,
      },
    }));
  }, [students, studentProfilesMap, unlockedStudentIds]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Loading students...</p>
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

  if (!requireTeacherUnlock) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          Teacher unlock is not enabled for this content. You can enable it in
          the content item settings.
        </p>
      </div>
    );
  }

  return (
    <SubmissionsTable
      columns={columns}
      rows={rows}
      profileFields={profileFields}
      displayFieldIds={displayFieldIds}
      filterFieldIds={filterFieldIds}
      profileFilterStorageKey={`unlock-students-filters-${classId}-${refId}`}
      showUnlockColumn={requireTeacherUnlock}
      contentName={contentName}
      onToggleUnlock={handleToggleUnlock}
      emptyMessage="No students enrolled in this class yet."
    />
  );
}
