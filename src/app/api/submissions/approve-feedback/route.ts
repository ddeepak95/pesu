import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { QuestionEvaluations, RubricScore } from "@/types/submission";
import { computeDenormalizedFields } from "@/lib/queries/submissions";

interface ApproveFeedbackRequestBody {
  submissionId: string;
  questionOrder: number;
  attemptNumber: number;
  /** Optional edited overall feedback text. If omitted, the original LLM feedback is kept. */
  evaluation_feedback?: string;
  /** Optional edited rubric scores array. If omitted, the original scores are kept. */
  rubric_scores?: RubricScore[];
}

export async function POST(request: NextRequest) {
  try {
    const body: ApproveFeedbackRequestBody = await request.json();
    const {
      submissionId,
      questionOrder,
      attemptNumber,
      evaluation_feedback,
      rubric_scores,
    } = body;

    if (!submissionId || questionOrder === undefined || !attemptNumber) {
      return NextResponse.json(
        { error: "Missing required fields: submissionId, questionOrder, attemptNumber" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // Fetch evaluations + fields needed to create the student notification
    const { data: submission, error: fetchError } = await supabase
      .from("submissions")
      .select("evaluations, student_id, assignment_id")
      .eq("submission_id", submissionId)
      .single();

    if (fetchError || !submission) {
      console.error("Error fetching submission for approval:", fetchError);
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      );
    }

    const evaluations = submission.evaluations as {
      [key: number]: QuestionEvaluations;
    };

    const questionEvals = evaluations[questionOrder];
    if (!questionEvals) {
      return NextResponse.json(
        { error: "Question evaluations not found" },
        { status: 404 }
      );
    }

    const attemptIndex = questionEvals.attempts.findIndex(
      (a) => a.attempt_number === attemptNumber
    );

    if (attemptIndex === -1) {
      return NextResponse.json(
        { error: "Attempt not found" },
        { status: 404 }
      );
    }

    // Apply optional edits and mark as approved
    const existingAttempt = questionEvals.attempts[attemptIndex];
    const updatedAttempt = {
      ...existingAttempt,
      ...(evaluation_feedback !== undefined && { evaluation_feedback }),
      ...(rubric_scores !== undefined && { rubric_scores }),
      feedback_approved: true,
    };

    questionEvals.attempts[attemptIndex] = updatedAttempt;
    evaluations[questionOrder] = questionEvals;

    // Recompute denormalized fields (score edits may affect highest_score)
    const denormalized = computeDenormalizedFields(evaluations);

    const { error: updateError } = await supabase
      .from("submissions")
      .update({
        evaluations,
        ...denormalized,
        updated_at: new Date().toISOString(),
      })
      .eq("submission_id", submissionId);

    if (updateError) {
      console.error("Error saving approved feedback:", updateError);
      return NextResponse.json(
        { error: "Failed to save approved feedback" },
        { status: 500 }
      );
    }

    // Insert student notification (best-effort — don't fail the request if this errors)
    if (submission.student_id && submission.assignment_id) {
      try {
        // Fetch assignment title + class UUID in parallel with class short ID lookup
        const { data: assignment } = await supabase
          .from("assignments")
          .select("title, class_id")
          .eq("assignment_id", submission.assignment_id)
          .single();

        if (assignment) {
          // class_id on the assignments row is the DB UUID of the class; look up the
          // human-readable class_id (short public ID) used in the student URL.
          const { data: classRow } = await supabase
            .from("classes")
            .select("class_id")
            .eq("id", assignment.class_id)
            .single();

          const shortClassId = classRow?.class_id;
          const navPath = shortClassId
            ? `/student/classes/${shortClassId}/assignments/${submission.assignment_id}`
            : null;

          if (navPath) {
            await supabase.from("student_notifications").insert({
              student_id: submission.student_id,
              type: "feedback_available",
              title: "Feedback available",
              message: `Your feedback for "${assignment.title}" is ready to view.`,
              data: {
                nav_path: navPath,
                assignment_title: assignment.title,
              },
            });
          }
        }
      } catch (notifErr) {
        // Notification failure must never break the approval response
        console.error("Failed to create feedback notification:", notifErr);
      }
    }

    return NextResponse.json({
      success: true,
      attempt: updatedAttempt,
    });
  } catch (error) {
    console.error("Approve feedback error:", error);
    return NextResponse.json(
      {
        error: "Failed to approve feedback",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
