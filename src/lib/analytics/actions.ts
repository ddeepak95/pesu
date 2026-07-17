"use server";

import { requireInstitutionAdminOrSuper } from "@/lib/dal";
import {
  getInstitutionAnalytics,
  type InstitutionAnalytics,
} from "@/lib/queries/institutionAnalytics";

/** Rolling window for the "recent" analytics counts: last 7 days. */
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface InstitutionAnalyticsActionResult {
  ok: boolean;
  error?: string;
  analytics?: InstitutionAnalytics;
}

/**
 * Lazy entry point for the institution engagement analytics — invoked from the
 * Analytics and Logs tab only when the admin clicks "Load analytics", so the
 * heaviest scan (turns over chat_messages) never runs on page landing.
 *
 * Re-gates with requireInstitutionAdminOrSuper (defense in depth: the RPC also
 * checks internally), then computes the 7-day window server-side so it is
 * deterministic per request rather than trusting a client-supplied timestamp.
 * See dev-docs/institution-analytics-and-logs-plan.md.
 */
export async function getInstitutionAnalyticsAction(input: {
  institutionId: string;
}): Promise<InstitutionAnalyticsActionResult> {
  try {
    const { supabase } = await requireInstitutionAdminOrSuper(
      input.institutionId,
    );
    const sinceIso = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();
    const analytics = await getInstitutionAnalytics(
      supabase,
      input.institutionId,
      sinceIso,
    );
    return { ok: true, analytics };
  } catch (err) {
    if (err instanceof Error) return { ok: false, error: err.message };
    if (
      err &&
      typeof err === "object" &&
      "message" in err &&
      typeof (err as { message: unknown }).message === "string"
    ) {
      return { ok: false, error: (err as { message: string }).message };
    }
    return { ok: false, error: String(err) };
  }
}
