"use client";

import { MoreVertical, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StudentWithInfo } from "@/lib/queries/students";
import { ClassGroup } from "@/lib/queries/groups";

interface StudentListItemMenuProps {
  student: StudentWithInfo;
  groups: ClassGroup[];
  onChangeGroup: (student: StudentWithInfo) => void;
  onDeleteStudent: (student: StudentWithInfo) => void;
}

export default function StudentListItemMenu({
  student,
  groups,
  onChangeGroup,
  onDeleteStudent,
}: StudentListItemMenuProps) {
  const hasGroups = groups.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {hasGroups && (
          <DropdownMenuItem onClick={() => onChangeGroup(student)}>
            <Users className="mr-2 h-4 w-4" />
            Change Group
          </DropdownMenuItem>
        )}
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
