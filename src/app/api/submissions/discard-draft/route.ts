import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { discardDrafts } from "@/lib/submissions/grading";

interface DiscardDraftRequestBody {
  submissionId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: DiscardDraftRequestBody = await request.json();
    const { submissionId } = body;

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

    await discardDrafts(supabase, submissionId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Discard draft error:", error);
    return NextResponse.json(
      {
        error: "Failed to discard draft",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
