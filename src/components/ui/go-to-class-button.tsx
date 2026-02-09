"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface GoToClassButtonProps {
  /** The class slug (class_id) used to build the URL. */
  classId: string;
}

export default function GoToClassButton({ classId }: GoToClassButtonProps) {
  const router = useRouter();

  return (
    <Button
      variant="outline"
      className="gap-2"
      onClick={() =>
        router.push(`/student/classes/${classId}`, { scroll: false })
      }
    >
      Go to Class
    </Button>
  );
}
