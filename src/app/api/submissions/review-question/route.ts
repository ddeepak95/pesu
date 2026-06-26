import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { setQuestionReviewed } from "@/lib/submissions/grading";

interface ReviewQuestionRequestBody {
  submissionId: string;
  questionOrder: number;
  reviewed: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: ReviewQuestionRequestBody = await request.json();
    const { submissionId, questionOrder, reviewed } = body;

    if (!submissionId || questionOrder === undefined || reviewed === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: submissionId, questionOrder, reviewed" },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();

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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    await setQuestionReviewed(
      supabase,
      submissionId,
      questionOrder,
      reviewed,
      user?.id ?? null,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Review question error:", error);
    return NextResponse.json(
      {
        error: "Failed to update review state",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
