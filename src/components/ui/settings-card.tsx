import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Consistent container for a settings "subcard" — the bordered sections inside
 * the assignment editor's More Options tabs (e.g. Require File Submission,
 * Language, Display Settings, Actions, Prompt Customizations). Uses a bright
 * `bg-background` so sections stand out against the muted tab body.
 *
 * Layout spacing is left to the caller (pass `space-y-3`, `flex`, etc. via
 * `className`) so the shared piece is purely the card's visual identity.
 */
export function SettingsCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-md border bg-background p-4", className)}
      {...props}
    />
  );
}
