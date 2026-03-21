import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { INTEGRITY_ACCESS_REVOKED_ERROR_CODE } from "./constants";

/**
 * Returns a 403 NextResponse if the submission is integrity-locked; otherwise null.
 */
export async function assertSubmissionNotIntegrityLocked(
  supabase: SupabaseClient,
  submissionId: string,
): Promise<NextResponse | null> {
  const { data, error } = await supabase
    .from("submissions")
    .select("integrity_access_revoked_at")
    .eq("submission_id", submissionId)
    .maybeSingle();

  if (error) {
    console.error("assertSubmissionNotIntegrityLocked fetch error:", error);
    return NextResponse.json(
      { error: "Failed to verify submission", code: "SUBMISSION_FETCH_FAILED" },
      { status: 500 },
    );
  }

  if (data?.integrity_access_revoked_at) {
    return NextResponse.json(
      {
        error:
          "Access to this assessment has been suspended. Contact your instructor if you need help.",
        code: INTEGRITY_ACCESS_REVOKED_ERROR_CODE,
      },
      { status: 403 },
    );
  }

  return null;
}
