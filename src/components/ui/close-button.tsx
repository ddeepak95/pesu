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
  /**
   * sessionStorage key whose value holds the scroll-Y to restore.
   * When provided, the saved position is restored after navigation
   * and the key is removed from storage.
   */
  scrollKey?: string;
}

export default function CloseButton({
  href,
  label = "Close",
  className,
  scrollKey,
}: CloseButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    // Read the saved scroll position before navigating
    let savedY: number | null = null;
    if (scrollKey) {
      try {
        const raw = sessionStorage.getItem(scrollKey);
        if (raw != null) {
          savedY = Number(raw);
          sessionStorage.removeItem(scrollKey);
        }
      } catch {}
    }

    router.push(href, { scroll: false });

    // Restore scroll after the page has rendered
    if (savedY != null) {
      const y = savedY;
      // Use a short timeout to let Next.js render the target page
      requestAnimationFrame(() => {
        setTimeout(() => window.scrollTo(0, y), 100);
      });
    }
  };

  return (
    <div className={cn("flex justify-center pt-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={handleClick}
      >
        {label}
      </Button>
    </div>
  );
}
