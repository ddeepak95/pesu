import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSettingsForClass } from "@/lib/queries/settings";
import {
  approveAllPendingInEvaluations,
  notifyFeedbackAvailable,
  saveApprovedEvaluations,
} from "@/lib/submissions/approveFeedback";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { QuestionEvaluations } from "@/types/submission";

interface BulkApproveFeedbackRequestBody {
  assignmentId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: BulkApproveFeedbackRequestBody = await request.json();
    const { assignmentId } = body;

    if (!assignmentId) {
      return NextResponse.json(
        { error: "Missing required field: assignmentId" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    const { data: assignment, error: assignmentError } = await supabase
      .from("assignments")
      .select("assignment_id, title, class_id, feedback_requires_approval")
      .eq("assignment_id", assignmentId)
      .single();

    if (assignmentError || !assignment) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 }
      );
    }

    if (!assignment.feedback_requires_approval) {
      return NextResponse.json(
        { error: "This assignment does not require feedback approval" },
        { status: 400 }
      );
    }

    const classDbId = assignment.class_id as string;
    const effectiveSettings = await getEffectiveSettingsForClass(
      supabase,
      classDbId
    );
    const bulkEnabled =
      effectiveSettings.enable_bulk_feedback_approval?.value === true;

    if (!bulkEnabled) {
      return NextResponse.json(
        { error: "Bulk feedback approval is not enabled for this class" },
        { status: 400 }
      );
    }

    const { data: submissions, error: submissionsError } = await supabase
      .from("submissions")
      .select("submission_id, student_id, evaluations")
      .eq("assignment_id", assignmentId)
      .eq("has_pending_approvals", true);

    if (submissionsError) {
      console.error("Error fetching submissions for bulk approve:", submissionsError);
      return NextResponse.json(
        { error: "Failed to load submissions" },
        { status: 500 }
      );
    }

    if (!submissions?.length) {
      return NextResponse.json({
        success: true,
        approvedAttemptCount: 0,
        affectedSubmissionCount: 0,
        notifiedStudentCount: 0,
      });
    }

    let approvedAttemptCount = 0;
    let affectedSubmissionCount = 0;
    const studentsToNotify = new Set<string>();

    for (const row of submissions) {
      const evaluations = (row.evaluations ?? {}) as {
        [key: number]: QuestionEvaluations;
      };
      const approved = approveAllPendingInEvaluations(evaluations);
      if (approved === 0) continue;

      const { error: saveError } = await saveApprovedEvaluations(
        supabase,
        row.submission_id,
        evaluations
      );

      if (saveError) {
        console.error(
          `Bulk approve failed for submission ${row.submission_id}:`,
          saveError
        );
        return NextResponse.json(
          { error: "Failed to save approved feedback" },
          { status: 500 }
        );
      }

      approvedAttemptCount += approved;
      affectedSubmissionCount += 1;
      if (row.student_id) {
        studentsToNotify.add(row.student_id as string);
      }
    }

    let notifiedStudentCount = 0;
    const assignmentTitle = assignment.title as string;
    for (const studentId of studentsToNotify) {
      try {
        await notifyFeedbackAvailable(supabase, {
          studentId,
          assignmentPublicId: assignmentId,
          assignmentTitle,
          classDbId,
        });
        notifiedStudentCount += 1;
      } catch (notifErr) {
        console.error(
          `Failed to create feedback notification for student ${studentId}:`,
          notifErr
        );
      }
    }

    return NextResponse.json({
      success: true,
      approvedAttemptCount,
      affectedSubmissionCount,
      notifiedStudentCount,
    });
  } catch (error) {
    console.error("Bulk approve feedback error:", error);
    return NextResponse.json(
      {
        error: "Failed to bulk approve feedback",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
