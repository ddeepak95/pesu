"use client";

import { useState, useEffect, useMemo } from "react";
import { Class } from "@/types/class";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import ManageStudentsDialog from "./ManageStudentsDialog";
import StudentListItemMenu from "./StudentListItemMenu";
import ChangeGroupDialog from "./ChangeGroupDialog";
import StudentProgressDialog from "./StudentProgressDialog";
import SubmissionsTable, {
  SubmissionsTableColumn,
  SubmissionsTableRow,
} from "@/components/Teacher/Shared/SubmissionsTable";
import {
  StudentWithInfo,
  getClassStudentsWithInfo,
} from "@/lib/queries/students";
import { getStudentDisplayName } from "@/lib/utils/displayName";
import { getClassGroups, ClassGroup } from "@/lib/queries/groups";
import {
  getProfileFieldsForClass,
  getAllStudentProfiles,
} from "@/lib/queries/profileFields";
import { getProgressViewConfig } from "@/lib/queries/classes";
import { ProfileField } from "@/types/profileFields";

interface StudentsProps {
  classData: Class;
}

export default function Students({ classData }: StudentsProps) {
  const { user } = useAuth();
  const [isTeacher, setIsTeacher] = useState(false);
  const isOwner = user?.id === classData.created_by;
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [students, setStudents] = useState<StudentWithInfo[]>([]);
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [profileFields, setProfileFields] = useState<ProfileField[]>([]);
  const [studentProfilesMap, setStudentProfilesMap] = useState<
    Map<string, Record<string, string>>
  >(new Map());
  const [displayFieldIds, setDisplayFieldIds] = useState<Set<string>>(
    new Set(),
  );
  const [filterFieldIds, setFilterFieldIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Change group dialog state
  const [changeGroupDialogOpen, setChangeGroupDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] =
    useState<StudentWithInfo | null>(null);

  // Progress dialog state
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);

  // Check if user is a co-teacher
  useEffect(() => {
    const checkTeacherStatus = async () => {
      if (!user) {
        setIsTeacher(false);
        return;
      }

      if (isOwner) {
        setIsTeacher(true);
        return;
      }

      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("class_teachers")
          .select("id")
          .eq("class_id", classData.id)
          .eq("teacher_id", user.id)
          .single();

        setIsTeacher(!error && data !== null);
      } catch {
        setIsTeacher(false);
      }
    };

    checkTeacherStatus();
  }, [user, classData.id, isOwner]);

  // Fetch enrolled students, groups, profile fields, profiles, and view config
  const fetchData = async () => {
    if (!isTeacher) {
      setLoading(false);
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
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher, classData.id]);

  const handleChangeGroup = (student: StudentWithInfo) => {
    setSelectedStudent(student);
    setChangeGroupDialogOpen(true);
  };

  const handleGroupChanged = () => {
    fetchData();
  };

  const tableRows: SubmissionsTableRow[] = useMemo(() => {
    return students.map((s) => {
      const groupDisplayName =
        s.group_name ||
        (s.group_index !== null ? `Group ${s.group_index + 1}` : "No group");
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
          if (!student || !groupList) return null;
          return (
            <StudentListItemMenu
              student={student}
              groups={groupList}
              onChangeGroup={handleChangeGroup}
            />
          );
        },
      },
    ];
  }, [handleChangeGroup, visibleDisplayFields]);

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

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    tableRows.forEach((row) => {
      const label =
        (row.data?.groupDisplayName as string)?.trim() || "No group";
      counts[label] = (counts[label] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tableRows]);

  const categoryCounts = useMemo(() => {
    return filterableFields.map((field) => {
      const optionCounts: Record<string, number> = {};
      (field.options ?? []).forEach((opt) => {
        optionCounts[opt] = 0;
      });
      optionCounts["(Not set)"] = 0;

      tableRows.forEach((row) => {
        const value = row.profileData?.[field.id];
        if (value == null || value.trim() === "") {
          optionCounts["(Not set)"] += 1;
        } else if (value in optionCounts) {
          optionCounts[value] += 1;
        } else {
          optionCounts[value] = (optionCounts[value] ?? 0) + 1;
        }
      });

      return {
        field,
        counts: Object.entries(optionCounts).map(([label, count]) => ({
          label,
          count,
        })),
      };
    });
  }, [filterableFields, tableRows]);

  return (
    <div className="py-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Students</h2>
        {isTeacher && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setProgressDialogOpen(true)}
            >
              View Student Progress
            </Button>
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
        <Tabs defaultValue="list" className="w-full">
          <TabsList className="mb-4 h-auto w-auto gap-1 rounded-md border bg-muted/30 p-1">
            <TabsTrigger value="list" className="rounded-sm px-4 py-2">
              List
            </TabsTrigger>
            <TabsTrigger value="by-category" className="rounded-sm px-4 py-2">
              Count by category
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-0">
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
                showUnlockColumn={false}
                emptyMessage="No students enrolled yet."
                searchPlaceholder="Search by student name..."
              />
            )}
          </TabsContent>

          <TabsContent value="by-category" className="mt-0">
            <div className="space-y-6">
              {groupCounts.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <h3 className="text-base font-medium">Group</h3>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5">
                      {groupCounts.map(({ label, count }) => (
                        <li
                          key={label}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-medium">{count}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
              {filterableFields.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>
                    No category fields configured. Add profile fields and mark
                    them as filter fields in Class settings → Profile fields →
                    View Config.
                  </p>
                </div>
              ) : (
                categoryCounts.map(({ field, counts }) => (
                  <Card key={field.id}>
                    <CardHeader className="pb-2">
                      <h3 className="text-base font-medium">
                        {field.field_name}
                      </h3>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1.5">
                        {counts.map(({ label, count }) => (
                          <li
                            key={label}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="text-muted-foreground">
                              {label}
                            </span>
                            <span className="font-medium">{count}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
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

      <StudentProgressDialog
        open={progressDialogOpen}
        onOpenChange={setProgressDialogOpen}
        classDbId={classData.id}
      />
    </div>
  );
}
