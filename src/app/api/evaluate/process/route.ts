import { NextRequest, NextResponse } from "next/server";
import {
  runBackgroundEvaluation,
  BackgroundEvaluationParams,
} from "@/lib/backgroundEvaluation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { assertSubmissionNotIntegrityLocked } from "@/lib/integrity/assertSubmissionNotIntegrityLocked";

/**
 * Retry endpoint for failed background evaluations.
 *
 * NOT called during normal student submission flow.  The main POST /api/evaluate
 * route handles everything — it saves the stub and schedules the LLM via after().
 *
 * Use this endpoint only when a background evaluation silently failed and the
 * teacher sees "Evaluation in progress..." indefinitely.  Pass the submissionId,
 * questionOrder, and attemptNumber of the stuck stub to re-run just the LLM step.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      submissionId,
      questionOrder,
      attemptNumber,
      answerText,
      questionPrompt,
      rubric,
      language,
      shared_context: sharedContext,
      custom_evaluation_prompt: customEvaluationPrompt,
    } = body;

    if (
      !submissionId ||
      questionOrder === undefined ||
      attemptNumber === undefined ||
      !answerText ||
      !questionPrompt ||
      !rubric ||
      !language
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const integrityBlock = await assertSubmissionNotIntegrityLocked(
      supabase,
      submissionId,
    );
    if (integrityBlock) {
      return integrityBlock;
    }

    const params: BackgroundEvaluationParams = {
      submissionId,
      questionOrder,
      attemptNumber,
      answerText,
      questionPrompt,
      rubric,
      language,
      sharedContext,
      customEvaluationPrompt,
    };

    const updatedAttempt = await runBackgroundEvaluation(params);
    return NextResponse.json({ success: true, attempt: updatedAttempt });
  } catch (error) {
    console.error("Process error:", error);
    return NextResponse.json(
      {
        error: "Background evaluation failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
