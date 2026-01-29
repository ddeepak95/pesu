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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { StudentWithInfo, reassignStudentToGroup } from "@/lib/queries/students";
import { ClassGroup } from "@/lib/queries/groups";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

interface ChangeGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: StudentWithInfo | null;
  groups: ClassGroup[];
  classDbId: string;
  onGroupChanged: () => void;
}

export default function ChangeGroupDialog({
  open,
  onOpenChange,
  student,
  groups,
  classDbId,
  onGroupChanged,
}: ChangeGroupDialogProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedGroupId("");
    }
    onOpenChange(newOpen);
  };

  const handleSave = async () => {
    if (!student || !selectedGroupId) return;

    setSaving(true);
    try {
      await reassignStudentToGroup({
        classDbId,
        studentId: student.student_id,
        newGroupId: selectedGroupId,
      });
      
      const newGroup = groups.find((g) => g.id === selectedGroupId);
      const groupName = newGroup?.name || `Group ${(newGroup?.group_index ?? 0) + 1}`;
      
      showSuccessToast(`Student moved to ${groupName}`);
      onGroupChanged();
      handleOpenChange(false);
    } catch (error) {
      console.error("Error changing group:", error);
      showErrorToast("Failed to change group. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!student) return null;

  const displayName =
    student.student_display_name ||
    student.student_email ||
    student.student_id.substring(0, 8) + "...";

  const currentGroupName =
    student.group_name ||
    (student.group_index !== null ? `Group ${student.group_index + 1}` : "No group");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Change Group</DialogTitle>
          <DialogDescription>
            Move <span className="font-medium">{displayName}</span> to a different group.
            Currently in: <span className="font-medium">{currentGroupName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Select
            value={selectedGroupId}
            onValueChange={setSelectedGroupId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a group" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectItem
                  key={group.id}
                  value={group.id}
                  disabled={group.id === student.group_id}
                >
                  {group.name || `Group ${group.group_index + 1}`}
                  {group.id === student.group_id && " (current)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selectedGroupId || selectedGroupId === student.group_id || saving}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
