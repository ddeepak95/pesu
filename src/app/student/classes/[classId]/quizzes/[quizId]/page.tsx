import Link from "next/link";
import { verifySession, getContentUnlockState } from "@/lib/dal";
import { notFound } from "next/navigation";
import QuizDetailClient from "./QuizDetailClient";
import PageLayout from "@/components/PageLayout";
import { Button } from "@/components/ui/button";

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
    return (
      <PageLayout>
        <div>
          <div className="mb-4">
            <Button variant="outline" asChild>
              <Link href={`/student/classes/${classId}`}>Go to class</Link>
            </Button>
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
            <Button variant="outline" asChild>
              <Link href={`/student/classes/${classId}`}>Go to class</Link>
            </Button>
          </div>
        </div>
      </PageLayout>
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
