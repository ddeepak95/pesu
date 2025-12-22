"use client";

import { useState, useEffect } from "react";
import { Class } from "@/types/class";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase";
import List from "@/components/ui/List";
import ManageStudentsDialog from "./ManageStudentsDialog";

interface StudentInfo {
  student_id: string;
  student_email: string | null;
  joined_at: string;
}

interface StudentsProps {
  classData: Class;
}

export default function Students({ classData }: StudentsProps) {
  const { user } = useAuth();
  const [isTeacher, setIsTeacher] = useState(false);
  const isOwner = user?.id === classData.created_by;
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Fetch enrolled students
  useEffect(() => {
    const fetchStudents = async () => {
      if (!isTeacher) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        const { data: studentData, error: studentError } = await supabase
          .from("class_students")
          .select("student_id, joined_at")
          .eq("class_id", classData.id)
          .order("joined_at", { ascending: false });

        if (studentError) throw studentError;

        // Fetch user emails for students (if available)
        const studentInfo: StudentInfo[] = [];

        if (studentData && studentData.length > 0) {
          // Try to get user emails from auth.users (via a view or function if available)
          // For now, we'll just use the student_id
          for (const student of studentData) {
            studentInfo.push({
              student_id: student.student_id,
              student_email: null, // Could be enhanced with a user info function
              joined_at: student.joined_at,
            });
          }
        }

        setStudents(studentInfo);
      } catch (err) {
        console.error("Error fetching students:", err);
        setError("Failed to load students.");
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
  }, [isTeacher, classData.id]);

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
            const displayId = s.student_email || s.student_id.substring(0, 8) + "...";

            return (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {displayId}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Joined: {new Date(s.joined_at).toLocaleDateString()}
                  </div>
                </div>
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

