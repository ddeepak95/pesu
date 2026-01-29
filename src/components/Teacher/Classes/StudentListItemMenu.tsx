"use client";

import { MoreVertical, Users } from "lucide-react";
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
}

export default function StudentListItemMenu({
  student,
  groups,
  onChangeGroup,
}: StudentListItemMenuProps) {
  const hasGroups = groups.length > 0;

  if (!hasGroups) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onChangeGroup(student)}>
          <Users className="mr-2 h-4 w-4" />
          Change Group
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
