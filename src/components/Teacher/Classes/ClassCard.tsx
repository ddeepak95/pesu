"use client";

import { useRouter } from "next/navigation";
import { Class } from "@/types/class";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface ClassCardProps {
  classData: Class;
  onEdit?: (classData: Class) => void;
  onDelete: (classId: string) => void;
  onInviteLink?: (classId: string) => void;
}

export default function ClassCard({
  classData,
  onEdit,
  onDelete,
  onInviteLink,
}: ClassCardProps) {
  const router = useRouter();

  const handleCardClick = () => {
    router.push(`/teacher/classes/${classData.class_id}`);
  };

  const handleMenuClick = (e: React.MouseEvent) => {
    // Prevent card click when clicking menu
    e.stopPropagation();
  };

  return (
    <Card
      className="hover:shadow-lg transition-shadow cursor-pointer"
      onClick={handleCardClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex-1">
          <CardTitle className="text-xl">{classData.name}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Class ID: {classData.class_id}
          </p>
        </div>
        <div onClick={handleMenuClick}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Options</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onInviteLink && (
                <DropdownMenuItem
                  onClick={() => onInviteLink(classData.class_id)}
                >
                  Invite Link
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(classData)}>
                  Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => onDelete(classData.id)}
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
