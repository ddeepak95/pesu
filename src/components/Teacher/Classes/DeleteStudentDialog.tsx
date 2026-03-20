"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StudentWithInfo } from "@/lib/queries/students";
import { getStudentDisplayName } from "@/lib/utils/displayName";
import { removeStudentFromClass } from "@/lib/queries/students";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

interface DeleteStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: StudentWithInfo | null;
  classDbId: string;
  onStudentDeleted: () => void;
}

export default function DeleteStudentDialog({
  open,
  onOpenChange,
  student,
  classDbId,
  onStudentDeleted,
}: DeleteStudentDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) setDeleting(false);
    onOpenChange(newOpen);
  };

  const handleDelete = async () => {
    if (!student) return;
    setDeleting(true);
    try {
      await removeStudentFromClass({
        classDbId,
        studentId: student.student_id,
      });
      showSuccessToast(`Removed ${getStudentDisplayName(student)} from class`);
      onStudentDeleted();
      handleOpenChange(false);
    } catch (error) {
      console.error("Error removing student:", error);
      showErrorToast("Failed to remove student. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const displayName = student ? getStudentDisplayName(student) : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Remove Student</DialogTitle>
          <DialogDescription>
            This will remove <span className="font-medium">{displayName}</span>{" "}
            from this class. They will no longer be able to accept invites or access class content until re-enabled.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={!student || deleting}
          >
            {deleting ? "Removing..." : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

