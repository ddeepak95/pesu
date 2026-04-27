"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { useNextContentItem } from "@/hooks/useNextContentItem";

interface NextItemButtonProps {
  /** Class UUID (classes.id) -- needed by SWR hooks */
  classDbId: string | null;
  /** Class short ID (classes.class_id) -- used in URLs */
  classId: string;
  /** Current content item UUID */
  contentItemId: string | null;
  /** Extra Tailwind classes for the wrapper div */
  className?: string;
  /** Optional callback fired before navigation. */
  onBeforeNavigate?: () => void;
}

export default function NextItemButton({
  classDbId,
  classId,
  contentItemId,
  className,
  onBeforeNavigate,
}: NextItemButtonProps) {
  const router = useRouter();
  const { nextUrl } = useNextContentItem(classDbId, classId, contentItemId);

  if (!nextUrl) return null;

  return (
    <div className={cn("flex justify-center pt-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="gap-2"
        onClick={() => {
          onBeforeNavigate?.();
          router.push(nextUrl);
        }}
      >
        Next Item
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
