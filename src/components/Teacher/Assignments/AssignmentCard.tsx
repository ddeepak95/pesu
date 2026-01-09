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
import { Share2 } from "lucide-react";

interface AssignmentCardProps {
  assignment: Assignment;
  onEdit?: (assignment: Assignment) => void;
  onDelete: (assignmentId: string) => void;
  onShareLinks?: (assignment: Assignment) => void;
  onClick?: (assignment: Assignment) => void;
}

export default function AssignmentCard({
  assignment,
  onEdit,
  onDelete,
  onShareLinks,
  onClick,
}: AssignmentCardProps) {
  const handleMenuClick = (e: React.MouseEvent) => {
    // Prevent any parent click handlers
    e.stopPropagation();
  };

  const handleCardClick = () => {
    if (onClick) {
      onClick(assignment);
    }
  };

  return (
    <Card 
      className={onClick ? "cursor-pointer hover:bg-accent transition-colors" : ""}
      onClick={handleCardClick}
    >
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
              {onShareLinks && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onShareLinks(assignment);
                  }}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share Links
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(assignment);
                  }}
                >
                  Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(assignment.id);
                }}
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

