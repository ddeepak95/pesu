/**
 * JSON Schema for LLM evaluation output.
 * Used by both evaluate/route.ts (sync) and backgroundEvaluation.ts (async).
 */

import { jsonSchema } from "ai";

export interface LLMRubricScore {
  item: string;
  points_earned: number;
  points_possible: number;
  feedback: string;
}

export interface EvaluationResult {
  rubric_scores: LLMRubricScore[];
  overall_feedback: string;
}

const evaluationSchemaShape = {
  type: "object",
  properties: {
    rubric_scores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          points_earned: { type: "number" },
          points_possible: { type: "number" },
          feedback: { type: "string" },
        },
        required: ["item", "points_earned", "points_possible", "feedback"],
        additionalProperties: false,
      },
    },
    overall_feedback: { type: "string" },
  },
  required: ["rubric_scores", "overall_feedback"],
  additionalProperties: false,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const evaluationSchema = jsonSchema<EvaluationResult>(evaluationSchemaShape as any);
