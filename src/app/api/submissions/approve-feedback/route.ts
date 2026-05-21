import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  approveAttemptInEvaluations,
  notifyFeedbackAvailable,
  saveApprovedEvaluations,
} from "@/lib/submissions/approveFeedback";
import { QuestionEvaluations, RubricScore } from "@/types/submission";

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

    const updatedAttempt = approveAttemptInEvaluations(
      evaluations,
      questionOrder,
      attemptNumber,
      { evaluation_feedback, rubric_scores }
    );

    if (!updatedAttempt) {
      const questionEvals = evaluations[questionOrder];
      if (!questionEvals) {
        return NextResponse.json(
          { error: "Question evaluations not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
    }

    const { error: updateError } = await saveApprovedEvaluations(
      supabase,
      submissionId,
      evaluations
    );

    if (updateError) {
      console.error("Error saving approved feedback:", updateError);
      return NextResponse.json(
        { error: "Failed to save approved feedback" },
        { status: 500 }
      );
    }

    if (submission.student_id && submission.assignment_id) {
      try {
        const { data: assignment } = await supabase
          .from("assignments")
          .select("title, class_id")
          .eq("assignment_id", submission.assignment_id)
          .single();

        if (assignment?.class_id) {
          await notifyFeedbackAvailable(supabase, {
            studentId: submission.student_id,
            assignmentPublicId: submission.assignment_id,
            assignmentTitle: assignment.title,
            classDbId: assignment.class_id,
          });
        }
      } catch (notifErr) {
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
