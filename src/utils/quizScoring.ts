import { Quiz, QuizSubmissionAnswer } from "@/types/quiz";

export function calculateQuizScore(
  quiz: Quiz,
  answers: QuizSubmissionAnswer[]
): { earnedPoints: number; totalPoints: number } {
  const answerMap = new Map<string, string>();
  for (const answer of answers) {
    answerMap.set(answer.question_id, answer.selected_option_id);
  }

  let earnedPoints = 0;
  let totalPoints = 0;

  for (const question of quiz.questions) {
    totalPoints += question.points || 0;
    const questionId = question.id || `order-${question.order}`;
    const selected = answerMap.get(questionId);
    if (selected && selected === question.correct_option_id) {
      earnedPoints += question.points || 0;
    }
  }

  return { earnedPoints, totalPoints };
}
