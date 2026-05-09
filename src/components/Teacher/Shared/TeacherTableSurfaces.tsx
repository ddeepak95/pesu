import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/** Default bordered shell for teacher-facing data tables (most submission lists). */
export function TeacherTablePanel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-md border bg-background", className)}
      {...props}
    />
  );
}

/**
 * Wide grids that may extend past the layout width (e.g. class roster / progress).
 * Scroll happens only on an inner wrapper; inset shadow + gradient sit on the outer shell so they stay fixed while the table moves horizontally.
 */
export function TeacherWideTablePanel({
  className,
  style,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <TeacherTablePanel
      className={cn(
        "relative max-w-full min-w-0 overflow-hidden",
        "shadow-[inset_-10px_0_18px_-8px_rgba(0,0,0,0.15)] dark:shadow-[inset_-10px_0_20px_-8px_rgba(0,0,0,0.48)]",
        className,
      )}
      {...props}
    >
      <div
        className="max-w-full min-w-0"
        style={{
          ...style,
          overflow: "auto clip",
        }}
      >
        {children}
      </div>
      {/* Outer-relative: does not scroll; must ignore hits so row controls (e.g. actions) stay hoverable */}
      <div
        aria-hidden
        style={{ pointerEvents: "none" }}
        className="absolute inset-y-px right-px w-8 bg-gradient-to-l from-black/17 to-transparent dark:from-black/45"
      />
    </TeacherTablePanel>
  );
}
