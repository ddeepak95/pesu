"use client";

import { Archive } from "lucide-react";
import { InfoBanner } from "@/components/ui/info-banner";

/**
 * Shown at the top of a teacher's class detail and settings pages when the
 * class is archived. Informational only — restoring happens from the class
 * Settings page (or the Archived Classes list).
 */
export function ArchivedClassBanner() {
  return (
    <InfoBanner variant="warning" icon={<Archive className="h-4 w-4" />}>
      <p>
        This class is archived. It&apos;s hidden from your class list and from
        students&apos; class lists. Restore it from Settings to return it to
        active use.
      </p>
    </InfoBanner>
  );
}
