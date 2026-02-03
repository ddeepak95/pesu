"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import { getClassStudentsWithInfo } from "@/lib/queries/students";
import { resetStudentProgress } from "@/lib/queries/contentCompletions";

interface ResetStudentProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  onSuccess: () => void;
}

export default function ResetStudentProgressDialog({
  open,
  onOpenChange,
  classId,
  onSuccess,
}: ResetStudentProgressDialogProps) {
  const [students, setStudents] = useState<
    Array<{
      student_id: string;
      student_display_name: string | null;
      student_email: string | null;
    }>
  >([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchStudents();
    }
  }, [open, classId]);

  const fetchStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const studentsData = await getClassStudentsWithInfo(classId);
      setStudents(studentsData);
    } catch (err) {
      console.error("Error fetching students:", err);
      setError("Failed to load students");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!selectedStudentId) {
      setError("Please select a student");
      return;
    }

    setResetting(true);
    setError(null);

    try {
      await resetStudentProgress(classId, selectedStudentId);
      onSuccess();
      onOpenChange(false);
      setSelectedStudentId("");
    } catch (err) {
      console.error("Error resetting student progress:", err);
      setError("Failed to reset progress. Please try again.");
    } finally {
      setResetting(false);
    }
  };

  const getStudentDisplayName = (student: (typeof students)[0]) => {
    return (
      student.student_display_name ||
      student.student_email ||
      student.student_id.substring(0, 8) + "..."
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Reset Student Progress</DialogTitle>
          <DialogDescription>
            Remove all content completion marks for a student in this class
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="student-select">Select Student</Label>
            <Select
              value={selectedStudentId}
              onValueChange={setSelectedStudentId}
              disabled={loading || resetting}
            >
              <SelectTrigger id="student-select">
                <SelectValue placeholder="Choose a student..." />
              </SelectTrigger>
              <SelectContent>
                {students.map((student) => (
                  <SelectItem
                    key={student.student_id}
                    value={student.student_id}
                  >
                    {getStudentDisplayName(student)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-medium text-amber-900 dark:text-amber-100">
                Warning: This action cannot be undone
              </p>
              <p className="text-amber-800 dark:text-amber-200">
                This will remove all completion marks for the selected student.
                All content items will be locked again if progressive unlock is
                enabled, except for the first item.
              </p>
            </div>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setSelectedStudentId("");
              setError(null);
            }}
            disabled={resetting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleReset}
            disabled={resetting || !selectedStudentId}
          >
            {resetting ? "Resetting..." : "Reset Progress"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
