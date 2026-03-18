"use client";

import { useEffect, useState, useMemo } from "react";
import { getClassStudentsWithInfo, StudentWithInfo } from "@/lib/queries/students";
import { getStudentDisplayName } from "@/lib/utils/displayName";
import { getClassByClassId, getProgressViewConfig } from "@/lib/queries/classes";
import {
  getProfileFieldsForClass,
  getAllStudentProfiles,
} from "@/lib/queries/profileFields";
import {
  getTeacherUnlocksForContentItem,
  unlockContentForStudent,
  lockContentForStudent,
} from "@/lib/queries/teacherUnlocks";
import { getContentItemByRefId } from "@/lib/queries/contentItems";
import { ContentItemType } from "@/types/contentItem";
import SubmissionsTable, {
  SubmissionsTableColumn,
  SubmissionsTableRow,
} from "./SubmissionsTable";
import { ProfileField } from "@/types/profileFields";

interface StudentUnlockTabProps {
  /** UUID of the underlying entity (survey.id, learning_content.id, etc.) */
  refId: string;
  /** Content item type */
  contentType: ContentItemType;
  /** Short class_id from URL (for getClassByClassId) */
  classId: string;
  /** Content name for the unlock dialog */
  contentName: string;
}

export default function StudentUnlockTab({
  refId,
  contentType,
  classId,
  contentName,
}: StudentUnlockTabProps) {
  const [students, setStudents] = useState<StudentWithInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Profile + config
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
  const [contentItemId, setContentItemId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const classData = await getClassByClassId(classId);
        if (!classData) {
          setError("Class not found");
          return;
        }

        const [classStudents, contentItem, fields, profiles, savedConfig] =
          await Promise.all([
            getClassStudentsWithInfo(classData.id),
            getContentItemByRefId(refId, contentType),
            getProfileFieldsForClass(classData.id),
            getAllStudentProfiles(classData.id),
            getProgressViewConfig(classData.id),
          ]);

        setStudents(classStudents);
        setProfileFields(fields);

        // Build profile map
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

        if (contentItem) {
          setContentItemId(contentItem.id);
          setRequireTeacherUnlock(
            contentItem.require_teacher_unlock ?? false
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
        console.error("Error fetching student unlock data:", err);
        setError("Failed to load student data.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [refId, contentType, classId]);

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

  // Columns: just the student list (no submission-specific data)
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

  // Build rows
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
