import { verifySession } from "@/lib/dal";
import { notFound } from "next/navigation";
import AssignmentDetailClient from "./AssignmentDetailClient";

const ASSIGNMENT_ALL_COLUMNS =
  "id, assignment_id, class_id, class_group_id, title, questions, total_points, created_by, created_at, updated_at, status, preferred_language, is_public, assessment_mode, responder_fields_config, max_attempts, bot_prompt_config, lock_language, student_instructions, show_rubric, show_rubric_points, use_star_display, star_scale, teacher_view_stars, require_all_attempts, shared_context_enabled, shared_context, evaluation_prompt, experience_rating_enabled, experience_rating_required";

export default async function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ classId: string; assignmentId: string }>;
}) {
  const { classId, assignmentId } = await params;
  const { supabase } = await verifySession("/teacher/login");

  const { data: assignmentData } = await supabase
    .from("assignments")
    .select(ASSIGNMENT_ALL_COLUMNS)
    .eq("assignment_id", assignmentId)
    .in("status", ["active", "draft"])
    .single();

  if (!assignmentData) notFound();

  return (
    <AssignmentDetailClient
      initialAssignment={assignmentData}
      classId={classId}
    />
  );
}
