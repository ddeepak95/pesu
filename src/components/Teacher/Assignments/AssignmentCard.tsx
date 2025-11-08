"use client";

import { Assignment } from "@/types/assignment";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface AssignmentCardProps {
  assignment: Assignment;
  onEdit?: (assignment: Assignment) => void;
  onDelete: (assignmentId: string) => void;
  onCopyLink?: (assignmentId: string) => void;
}

export default function AssignmentCard({
  assignment,
  onEdit,
  onDelete,
  onCopyLink,
}: AssignmentCardProps) {
  const handleMenuClick = (e: React.MouseEvent) => {
    // Prevent any parent click handlers
    e.stopPropagation();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex-1">
          <CardTitle className="text-xl">{assignment.title}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {assignment.total_points} points
          </p>
        </div>
        <div onClick={handleMenuClick}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <span className="text-xl">⋮</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onCopyLink && (
                <DropdownMenuItem
                  onClick={() => onCopyLink(assignment.assignment_id)}
                >
                  Copy link
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(assignment)}>
                  Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => onDelete(assignment.id)}
                className="text-destructive"
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
    </Card>
  );
}

