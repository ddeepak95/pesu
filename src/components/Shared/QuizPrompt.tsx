import type { MCQQuestion } from "@/types/quiz";
import MarkdownContent from "./MarkdownContent";

export default function QuizPrompt({ question }: { question: MCQQuestion }) {
  return <div className="min-w-0 flex-1 break-words">
    {question.prompt_format === "markdown"
      ? <MarkdownContent content={question.prompt} />
      : <p className="whitespace-pre-wrap">{question.prompt}</p>}
  </div>;
}
