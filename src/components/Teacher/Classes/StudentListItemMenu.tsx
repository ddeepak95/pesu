"use client";

import { LineChart, MoreVertical, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StudentWithInfo } from "@/lib/queries/students";
import { ClassGroup } from "@/lib/queries/groups";

interface StudentListItemMenuProps {
  student: StudentWithInfo;
  groups: ClassGroup[];
  onViewProgress: (student: StudentWithInfo) => void;
  onChangeGroup: (student: StudentWithInfo) => void;
  onDeleteStudent: (student: StudentWithInfo) => void;
}

export default function StudentListItemMenu({
  student,
  groups,
  onViewProgress,
  onChangeGroup,
  onDeleteStudent,
}: StudentListItemMenuProps) {
  // Reassigning groups is only meaningful when the class has more than one.
  const hasGroups = groups.length > 1;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onViewProgress(student)}>
          <LineChart className="mr-2 h-4 w-4" />
          View Progress
        </DropdownMenuItem>
        {hasGroups && (
          <DropdownMenuItem onClick={() => onChangeGroup(student)}>
            <Users className="mr-2 h-4 w-4" />
            Change Group
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onDeleteStudent(student)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Remove from class
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
