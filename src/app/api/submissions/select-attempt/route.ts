import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { setSelectedAttempt } from "@/lib/submissions/grading";

interface SelectAttemptRequestBody {
  submissionId: string;
  questionId: string;
  attemptNumber: number;
}

export async function PATCH(request: NextRequest) {
  try {
    const body: SelectAttemptRequestBody = await request.json();
    const { submissionId, questionId, attemptNumber } = body;

    if (!submissionId || !questionId || !attemptNumber) {
      return NextResponse.json(
        { error: "Missing required fields: submissionId, questionId, attemptNumber" },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();

    const { data: isTeacher } = await supabase.rpc("is_submission_teacher", {
      p_submission_id: submissionId,
    });

    if (isTeacher) {
      // Teacher may re-select anytime. Switching the counted attempt is itself a
      // grading decision, so an existing review is preserved (not cleared); when
      // the submission is already released, setSelectedAttempt re-syncs the
      // released score to the newly counted attempt.
      await setSelectedAttempt(supabase, submissionId, questionId, attemptNumber, {
        clearReview: false,
      });
      return NextResponse.json({ success: true });
    }

    // Student path: allowed only before they finish (status <> 'completed').
    const { data: submission, error: subError } = await supabase
      .from("submissions")
      .select("status, student_id")
      .eq("submission_id", submissionId)
      .maybeSingle();

    if (subError || !submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }
    if (submission.status === "completed") {
      return NextResponse.json({ error: "selection_frozen" }, { status: 403 });
    }
    // For authenticated submissions, the owner must match; public (anon) submissions
    // have no student_id and follow the existing submission_id-possession trust model.
    if (submission.student_id) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || user.id !== submission.student_id) {
        return NextResponse.json({ error: "Not authorized" }, { status: 403 });
      }
    }

    await setSelectedAttempt(supabase, submissionId, questionId, attemptNumber, {
      clearReview: false,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Select attempt error:", error);
    return NextResponse.json(
      {
        error: "Failed to select attempt",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
