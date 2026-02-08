import { verifySession } from "@/lib/dal";
import { notFound } from "next/navigation";
import QuizDetailClient from "./QuizDetailClient";

const QUIZ_ALL_COLUMNS =
  "id, quiz_id, class_id, class_group_id, title, instructions, questions, randomize_questions, randomize_options, show_points_to_students, total_points, created_by, created_at, updated_at, status";

export default async function QuizDetailPage({
  params,
}: {
  params: Promise<{ classId: string; quizId: string }>;
}) {
  const { classId, quizId } = await params;
  const { supabase } = await verifySession("/teacher/login");

  const { data: quizData } = await supabase
    .from("quizzes")
    .select(QUIZ_ALL_COLUMNS)
    .eq("quiz_id", quizId)
    .in("status", ["active", "draft"])
    .single();

  if (!quizData) notFound();

  return <QuizDetailClient initialQuiz={quizData} classId={classId} />;
}
