import { cache } from "react";
import { verifySession } from "@/lib/dal";
import { notFound } from "next/navigation";
import QuizDetailClient from "./QuizDetailClient";

const QUIZ_ALL_COLUMNS =
  "id, quiz_id, class_id, class_group_id, title, instructions, questions, randomize_questions, randomize_options, show_points_to_students, total_points, created_by, created_at, updated_at, status";

const getQuizData = cache(async (quizId: string) => {
  const { supabase } = await verifySession("/teacher/login");

  const { data } = await supabase
    .from("quizzes")
    .select(QUIZ_ALL_COLUMNS)
    .eq("quiz_id", quizId)
    .in("status", ["active", "draft"])
    .single();

  return data;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = await params;
  const quizData = await getQuizData(quizId);
  return { title: quizData?.title ?? "Quiz" };
}

export default async function QuizDetailPage({
  params,
}: {
  params: Promise<{ classId: string; quizId: string }>;
}) {
  const { classId, quizId } = await params;
  const quizData = await getQuizData(quizId);

  if (!quizData) notFound();

  return <QuizDetailClient initialQuiz={quizData} classId={classId} />;
}
