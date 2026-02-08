import { verifySession, getContentUnlockState } from "@/lib/dal";
import { notFound } from "next/navigation";
import AssignmentDetailClient from "./AssignmentDetailClient";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";

const ASSIGNMENT_ALL_COLUMNS =
  "id, assignment_id, class_id, class_group_id, title, questions, total_points, created_by, created_at, updated_at, status, preferred_language, is_public, assessment_mode, responder_fields_config, max_attempts, bot_prompt_config, lock_language, student_instructions, show_rubric, show_rubric_points, use_star_display, star_scale, teacher_view_stars, require_all_attempts, shared_context_enabled, shared_context, evaluation_prompt, experience_rating_enabled, experience_rating_required";

export default async function StudentAssignmentPage({
  params,
}: {
  params: Promise<{ classId: string; assignmentId: string }>;
}) {
  const { classId, assignmentId } = await params;
  const { user, supabase } = await verifySession("/student/login");

  const { data: assignmentData } = await supabase
    .from("assignments")
    .select(ASSIGNMENT_ALL_COLUMNS)
    .eq("assignment_id", assignmentId)
    .in("status", ["active", "draft"])
    .single();

  if (!assignmentData) notFound();

  // Check unlock state
  const unlockResult = await getContentUnlockState(
    supabase,
    user.id,
    classId,
    assignmentData.id,
    "formative_assignment"
  );

  if (unlockResult.isLocked) {
    return (
      <PageLayout>
        <div>
          <div className="mb-4">
            <BackButton />
          </div>
          <div className="text-center py-12">
            <div className="inline-block p-4 rounded-full bg-muted mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-12 w-12 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2">Content Locked</h2>
            <p className="text-muted-foreground mb-4">
              {unlockResult.lockReason}
            </p>
            <BackButton />
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <AssignmentDetailClient
      assignmentData={assignmentData}
      assignmentId={assignmentId}
      classId={classId}
      contentItemId={unlockResult.contentItemId}
      classUuid={unlockResult.classUuid}
    />
  );
}
