"use client";

import { Archive } from "lucide-react";

/**
 * Shown at the top of a teacher's class detail and settings pages when the
 * class is archived. Informational only — restoring happens from the class
 * Settings page (or the Archived Classes list).
 */
export function ArchivedClassBanner() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
      <Archive className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        This class is archived. It&apos;s hidden from your class list and from
        students&apos; class lists. Restore it from Settings to return it to
        active use.
      </p>
    </div>
  );
}
