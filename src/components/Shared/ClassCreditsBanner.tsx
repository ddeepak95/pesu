"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { InfoBanner } from "@/components/ui/info-banner";
import {
  useClassQuotaStatus,
  type QuotaStatusEntry,
} from "@/hooks/swr/useClassQuotaStatus";

interface ClassCreditsBannerProps {
  classDbId: string;
  /**
   * Link to the class's AI settings tab. Callers own routing — the
   * `[classId]` route segment is matched against `classes.class_id` (a
   * human-readable slug), not the `classDbId` UUID this component fetches
   * quota status with, so the href can't be derived from `classDbId` alone.
   */
  settingsHref: string;
}

function isExhausted(entry: QuotaStatusEntry) {
  return (
    entry.kind === "wallet" &&
    entry.enforcement === "block" &&
    (entry.balance ?? 0) <= 0
  );
}

function isLow(entry: QuotaStatusEntry) {
  return (
    entry.kind === "wallet" &&
    entry.enforcement === "warn" &&
    entry.belowWarnThreshold === true
  );
}

/**
 * Proactive teacher-facing counterpart to the student flow's reactive
 * out-of-credits banner (MultimodalInputArea) — the quota-status endpoint is
 * teacher/admin-only, so students can't poll it themselves.
 */
export function ClassCreditsBanner({
  classDbId,
  settingsHref,
}: ClassCreditsBannerProps) {
  const { data } = useClassQuotaStatus(classDbId);
  if (!data) return null;

  const entries = [data.platform, data.byok];
  const exhausted = entries.some(isExhausted);
  const low = !exhausted && entries.some(isLow);
  if (!exhausted && !low) return null;

  return (
    <InfoBanner
      variant={exhausted ? "error" : "warning"}
      icon={<AlertTriangle className="h-4 w-4" />}
    >
      {exhausted
        ? "This class has run out of AI credits. Students can't start new AI activities until credits are added."
        : "This class is running low on AI credits."}{" "}
      <Link href={settingsHref} className="font-medium underline">
        Manage AI credits
      </Link>
    </InfoBanner>
  );
}
