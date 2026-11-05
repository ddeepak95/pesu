import type { MCQQuestion } from "@/types/quiz";

export function escapeQuizMarkdown(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/([\\`*_{}\[\]()<>#+\-.!|~])/g, "\\$1");
}

export function editableQuizPrompt(question: MCQQuestion): string {
  return question.prompt_format === "markdown" ? question.prompt : escapeQuizMarkdown(question.prompt);
}

export function quizImageMarkdown(url: string, description: string): string {
  return `\n\n![${escapeQuizMarkdown(description.replace(/[\r\n]+/g, " "))}](${url})\n\n`;
}
