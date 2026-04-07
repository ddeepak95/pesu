/**
 * JSON Schema factory for dynamic question generation.
 * Used by generate-dynamic-questions/route.ts.
 *
 * The schema is parameterized by question count so the LLM output is
 * validated against the exact number requested.
 */

import { jsonSchema } from "ai";
import type { RubricItem } from "@/types/assignment";

export interface GeneratedQuestion {
  question_index: number;
  prompt: string;
  rubric: RubricItem[];
  expected_answer: string;
}

export interface GeneratedQuestionsResult {
  questions: GeneratedQuestion[];
}

export function buildGeneratedQuestionsSchema(questionCount: number) {
  const questionItemSchema = {
    type: "object" as const,
    properties: {
      question_index: {
        type: "number" as const,
        description: `The 0-based index of this question (0 through ${questionCount - 1})`,
      },
      prompt: {
        type: "string" as const,
        description: "The question text to ask the student",
      },
      rubric: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            item: { type: "string" as const },
            points: { type: "number" as const },
          },
          required: ["item", "points"] as const,
          additionalProperties: false,
        },
      },
      expected_answer: {
        type: "string" as const,
        description: "Key points the answer should cover (for AI evaluation reference)",
      },
    },
    required: ["question_index", "prompt", "rubric", "expected_answer"] as const,
    additionalProperties: false,
  };

  const shape = {
    type: "object" as const,
    properties: {
      questions: {
        type: "array" as const,
        minItems: questionCount,
        maxItems: questionCount,
        items: questionItemSchema,
      },
    },
    required: ["questions"] as const,
    additionalProperties: false,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jsonSchema<GeneratedQuestionsResult>(shape as any);
}
