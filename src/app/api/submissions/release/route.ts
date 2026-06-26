import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  releaseSubmission,
  reopenSubmission,
  type AttemptEdit,
  type SelectionOverride,
} from "@/lib/submissions/grading";

interface ReleaseRequestBody {
  submissionId: string;
  /** When true, reopen (clear the release flag) instead of releasing. */
  reopen?: boolean;
  edits?: AttemptEdit[];
  selections?: SelectionOverride[];
}

export async function POST(request: NextRequest) {
  try {
    const body: ReleaseRequestBody = await request.json();
    const { submissionId, reopen, edits, selections } = body;

    if (!submissionId) {
      return NextResponse.json(
        { error: "Missing required field: submissionId" },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();

    // Teacher-only.
    const { data: isTeacher, error: teacherError } = await supabase.rpc(
      "is_submission_teacher",
      { p_submission_id: submissionId },
    );
    if (teacherError) {
      console.error("is_submission_teacher failed:", teacherError);
      return NextResponse.json({ error: "Authorization check failed" }, { status: 500 });
    }
    if (!isTeacher) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    if (reopen) {
      await reopenSubmission(supabase, submissionId);
      return NextResponse.json({ success: true, released: false });
    }

    const result = await releaseSubmission(supabase, submissionId, { edits, selections });
    if (!result.ok) {
      return NextResponse.json(
        {
          error: "unreviewed_questions",
          questionOrders: result.unreviewedQuestionOrders,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, released: true });
  } catch (error) {
    console.error("Release submission error:", error);
    return NextResponse.json(
      {
        error: "Failed to release submission",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
