"use client";

import useSWR from "swr";

export interface QuotaStatusEntry {
  kind: "unrestricted" | "wallet";
  enforcement?: "off" | "warn" | "block";
  balance?: number;
  belowWarnThreshold?: boolean;
}

/**
 * Dual-debit cap model: `pool` is the institution's credit pool, `classCap`
 * the class's own spending cap (unrestricted when the class has none). BYOK
 * usage is unmetered and never appears here.
 */
export interface ClassQuotaStatusResponse {
  pool: QuotaStatusEntry;
  classCap: QuotaStatusEntry;
}

async function fetchClassQuotaStatus(
  classDbId: string,
): Promise<ClassQuotaStatusResponse> {
  const res = await fetch(
    `/api/ai/quota-status?classId=${encodeURIComponent(classDbId)}`,
  );
  if (!res.ok) {
    throw new Error("Failed to load quota status");
  }
  return res.json();
}

/** Teacher/admin-only (the endpoint 403s for students) — used for proactive class-credits banners. */
export function useClassQuotaStatus(classDbId: string | null) {
  return useSWR<ClassQuotaStatusResponse>(
    classDbId ? `class-quota-status:${classDbId}` : null,
    () => fetchClassQuotaStatus(classDbId!),
    { shouldRetryOnError: false },
  );
}
