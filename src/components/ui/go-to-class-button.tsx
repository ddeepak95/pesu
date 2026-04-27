"use client";

import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { Button } from "@/components/ui/button";
import { invalidateCompletionsCache } from "@/hooks/swr";

interface GoToClassButtonProps {
  /** The class slug (class_id) used to build the URL. */
  classId: string;
  /** Optional callback fired before navigation. */
  onBeforeNavigate?: () => void;
}

export default function GoToClassButton({
  classId,
  onBeforeNavigate,
}: GoToClassButtonProps) {
  const router = useTrackedRouter();

  return (
    <Button
      variant="outline"
      className="gap-2"
      onClick={() => {
        onBeforeNavigate?.();
        invalidateCompletionsCache();
        router.push(`/student/classes/${classId}`, { scroll: false });
      }}
    >
      Go to Class
    </Button>
  );
}
