"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CloseButtonProps {
  /** URL to navigate to. */
  href: string;
  /** Button label. Defaults to "Close". */
  label?: string;
  /** Extra Tailwind classes for the wrapper div. */
  className?: string;
  /** Optional callback fired before navigation. */
  onBeforeNavigate?: () => void;
}

export default function CloseButton({
  href,
  label = "Close",
  className,
  onBeforeNavigate,
}: CloseButtonProps) {
  const router = useRouter();

  return (
    <div className={cn("flex justify-center pt-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => {
          onBeforeNavigate?.();
          router.push(href, { scroll: false });
        }}
      >
        {label}
      </Button>
    </div>
  );
}
