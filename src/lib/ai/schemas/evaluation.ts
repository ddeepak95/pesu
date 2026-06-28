/**
 * JSON Schema for LLM evaluation output. Used by evaluate/route.ts.
 */

import { jsonSchema } from "ai";
import { feedbackDocJsonSchema } from "@/types/feedbackDoc";

export interface LLMRubricScore {
  item: string;
  points_earned: number;
  points_possible: number;
  feedback: string;
}

export interface EvaluationResult {
  rubric_scores: LLMRubricScore[];
  /** Flattened plain-text fallback (kept for backward compat / search). */
  overall_feedback: string;
  /**
   * Structured block document. Validated against the Zod schema downstream; an
   * invalid/missing doc triggers regeneration, then falls back to wrapping
   * overall_feedback in a single paragraph.
   */
  feedback_doc: unknown;
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
    feedback_doc: feedbackDocJsonSchema,
  },
  required: ["rubric_scores", "overall_feedback", "feedback_doc"],
  additionalProperties: false,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const evaluationSchema = jsonSchema<EvaluationResult>(evaluationSchemaShape as any);
