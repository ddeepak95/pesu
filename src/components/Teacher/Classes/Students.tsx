"use client";

import { useState, useEffect } from "react";
import { Class } from "@/types/class";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase";
import List from "@/components/ui/List";
import ManageStudentsDialog from "./ManageStudentsDialog";
import {
  StudentWithInfo,
  getClassStudentsWithInfo,
  reassignStudentToGroup,
} from "@/lib/queries/students";
import { getClassGroups, ClassGroup } from "@/lib/queries/groups";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<Record<string, boolean>>({});

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

  // Fetch enrolled students and groups
  useEffect(() => {
    const fetchData = async () => {
      if (!isTeacher) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const [studentsData, groupsData] = await Promise.all([
          getClassStudentsWithInfo(classData.id),
          getClassGroups(classData.id),
        ]);

        setStudents(studentsData);
        setGroups(groupsData);
      } catch (err) {
        console.error("Error fetching students:", err);
        setError("Failed to load students.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isTeacher, classData.id]);

  const handleReassignGroup = async (
    studentId: string,
    newGroupId: string
  ) => {
    setReassigning((prev) => ({ ...prev, [studentId]: true }));
    try {
      await reassignStudentToGroup({
        classDbId: classData.id,
        studentId,
        newGroupId,
      });
      // Refresh the students list
      const studentsData = await getClassStudentsWithInfo(classData.id);
      setStudents(studentsData);
    } catch (err) {
      console.error("Error reassigning student:", err);
      alert("Failed to reassign student to group. Please try again.");
    } finally {
      setReassigning((prev) => ({ ...prev, [studentId]: false }));
    }
  };

  return (
    <div className="py-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Students</h2>
        {isTeacher && (
          <Button onClick={() => setManageDialogOpen(true)}>
            Invite Students
          </Button>
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
        <List
          items={students}
          emptyMessage="No students enrolled yet. Use the 'Invite Students' button to generate an invite link."
          renderItem={(s) => {
            const displayName =
              s.student_display_name ||
              s.student_email ||
              s.student_id.substring(0, 8) + "...";
            const groupDisplayName =
              s.group_name || (s.group_index !== null ? `Group ${s.group_index + 1}` : "No group");

            return (
              <div className="flex items-center justify-between rounded-md border p-3 gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {displayName}
                  </div>
                  {s.student_email && s.student_display_name && (
                    <div className="text-xs text-muted-foreground truncate">
                      {s.student_email}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    Joined: {new Date(s.joined_at).toLocaleDateString()} • Group: {groupDisplayName}
                  </div>
                </div>
                {groups.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Select
                      value={s.group_id || ""}
                      onValueChange={(newGroupId) =>
                        handleReassignGroup(s.student_id, newGroupId)
                      }
                      disabled={reassigning[s.student_id]}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Select group" />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name || `Group ${group.group_index + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            );
          }}
        />
      )}

      <ManageStudentsDialog
        classData={classData}
        open={manageDialogOpen}
        onOpenChange={setManageDialogOpen}
      />
    </div>
  );
}

