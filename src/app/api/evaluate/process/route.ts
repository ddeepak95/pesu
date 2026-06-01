import { NextRequest, NextResponse } from "next/server";
import {
  runBackgroundEvaluation,
  BackgroundEvaluationParams,
} from "@/lib/backgroundEvaluation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { assertSubmissionNotIntegrityLocked } from "@/lib/integrity/assertSubmissionNotIntegrityLocked";
import {
  catalogNotConfiguredResponse,
} from "@/lib/ai/credentials/resolveCatalogConfig";
import { getCachedResolveModelConfig } from "@/lib/ai/credentials/modelConfigCache";
import {
  getActivityTypeForAssignment,
  getClassDbIdForAssignment,
} from "@/lib/assignments/assignmentClassCache";

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
        { status: 400 },
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

    const { data: submission, error: fetchError } = await supabase
      .from("submissions")
      .select("assignment_id")
      .eq("submission_id", submissionId)
      .single();

    if (fetchError || !submission?.assignment_id) {
      return NextResponse.json(
        { error: "Failed to fetch submission" },
        { status: 500 },
      );
    }

    const classDbId = await getClassDbIdForAssignment(
      supabase,
      submission.assignment_id as string,
    );
    if (!classDbId) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 },
      );
    }

    const activityType = await getActivityTypeForAssignment(
      supabase,
      submission.assignment_id as string,
    );

    let evalResolved;
    try {
      evalResolved = await getCachedResolveModelConfig({
        classDbId,
        appFunctionKey: "text.evaluation",
      });
    } catch (error) {
      const notConfigured = catalogNotConfiguredResponse(error);
      if (notConfigured) {
        return NextResponse.json(notConfigured.body, {
          status: notConfigured.status,
        });
      }
      throw error;
    }

    const params: BackgroundEvaluationParams = {
      submissionId,
      assignmentId: submission.assignment_id as string,
      classDbId,
      questionOrder,
      attemptNumber,
      answerText,
      questionPrompt,
      rubric,
      language,
      sharedContext,
      customEvaluationPrompt,
      activityType,
      modelConfig: evalResolved.config,
      keySource: evalResolved.keySource,
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
      { status: 500 },
    );
  }
}
