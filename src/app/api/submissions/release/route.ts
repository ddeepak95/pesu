import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  releaseSubmission,
  type AttemptEdit,
  type SelectionOverride,
} from "@/lib/submissions/grading";

interface ReleaseRequestBody {
  submissionId: string;
  edits?: AttemptEdit[];
  selections?: SelectionOverride[];
}

export async function POST(request: NextRequest) {
  try {
    const body: ReleaseRequestBody = await request.json();
    const { submissionId, edits, selections } = body;

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

    const result = await releaseSubmission(supabase, submissionId, { edits, selections });
    if (!result.ok) {
      return NextResponse.json(
        {
          error: "unreviewed_questions",
          questionIds: result.unreviewedQuestionIds,
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
