"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  /** Header title shown in the toggle button. */
  title: string;
  /** Whether the section starts expanded. Defaults to closed. */
  defaultOpen?: boolean;
  /** Disables the toggle button. */
  disabled?: boolean;
  /** Extra classes for the expanded content container (e.g. background tint). */
  contentClassName?: string;
  children: React.ReactNode;
}

/**
 * A bordered, collapsible card with a header toggle — the shared pattern used by
 * the assignment form's "Language" and "More Options" sections.
 */
export function CollapsibleSection({
  title,
  defaultOpen = false,
  disabled = false,
  contentClassName,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-md border bg-background">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-muted/50"
        disabled={disabled}
      >
        <h3 className="text-sm font-semibold">{title}</h3>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className={cn("p-4 pt-0 border-t rounded-b-md", contentClassName)}>
          {children}
        </div>
      )}
    </div>
  );
}
