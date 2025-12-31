"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function CreateContentMenu({
  classPublicId,
  selectedGroupId,
}: {
  classPublicId: string;
  selectedGroupId: string | null;
}) {
  const router = useRouter();

  const qs = selectedGroupId ? `?tab=content&groupId=${selectedGroupId}` : "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={!selectedGroupId}>Create</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() =>
            router.push(`/teacher/classes/${classPublicId}/quizzes/create${qs}`)
          }
        >
          Create Quiz
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            router.push(
              `/teacher/classes/${classPublicId}/learning-content/create${qs}`
            )
          }
        >
          Create Learning Content
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            router.push(
              `/teacher/classes/${classPublicId}/assignments/create${qs}`
            )
          }
        >
          Create Formative Assessment
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

