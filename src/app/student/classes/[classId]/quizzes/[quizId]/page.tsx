import { verifySession, getContentUnlockState, buildContentItemUrl } from "@/lib/dal";
import { notFound } from "next/navigation";
import QuizDetailClient from "./QuizDetailClient";
import { ContentLockedView } from "@/components/Shared/ContentLockedView";

const QUIZ_ALL_COLUMNS =
  "id, quiz_id, class_id, class_group_id, title, instructions, questions, randomize_questions, randomize_options, show_points_to_students, total_points, created_by, created_at, updated_at, status";

const QUIZ_SUBMISSION_ALL_COLUMNS =
  "id, quiz_id, class_id, student_id, answers, submitted_at, created_at";

export default async function StudentQuizPage({
  params,
}: {
  params: Promise<{ classId: string; quizId: string }>;
}) {
  const { classId, quizId } = await params;
  const { user, supabase } = await verifySession("/student/login");

  const { data: quizData } = await supabase
    .from("quizzes")
    .select(QUIZ_ALL_COLUMNS)
    .eq("quiz_id", quizId)
    .in("status", ["active", "draft"])
    .single();

  if (!quizData) notFound();

  // Check unlock state + completion
  const unlockResult = await getContentUnlockState(
    supabase,
    user.id,
    classId,
    quizData.id,
    "quiz"
  );

  if (unlockResult.isLocked) {
    let backHref = `/student/classes/${classId}`;
    let backLabel = "Go to class";
    const prev = unlockResult.previousItem;
    if (prev) {
      const url = await buildContentItemUrl(
        supabase,
        classId,
        prev.refId,
        prev.type
      );
      if (url) {
        backHref = url;
        backLabel = "Go to previous item";
      }
    }
    return (
      <ContentLockedView
        lockReason={unlockResult.lockReason!}
        classHref={`/student/classes/${classId}`}
        backHref={backHref}
        backLabel={backLabel}
        showBackButton={!unlockResult.isLockedAfterComplete}
      />
    );
  }

  // Check for existing submission
  const { data: existingSubmission } = await supabase
    .from("quiz_submissions")
    .select(QUIZ_SUBMISSION_ALL_COLUMNS)
    .eq("quiz_id", quizData.id)
    .eq("student_id", user.id)
    .maybeSingle();

  return (
    <QuizDetailClient
      quiz={quizData}
      contentItemId={unlockResult.contentItemId}
      isComplete={unlockResult.isComplete}
      existingSubmission={existingSubmission}
      classUuid={unlockResult.classUuid}
      classId={classId}
    />
  );
}
