/**
 * JSON Schema for rubric + expected answer generation.
 * Used by generate-rubric-and-answer/route.ts.
 */

import { jsonSchema } from "ai";
import type { RubricItem } from "@/types/assignment";

export interface RubricGenerationResult {
  detected_language: string;
  rubric: RubricItem[];
  expected_answer: string;
}

const rubricGenerationSchemaShape = {
  type: "object",
  properties: {
    detected_language: {
      type: "string",
      description:
        "ISO 639-1 language code detected from the prompt (e.g., 'en', 'hi', 'kn', 'ta', 'ml', 'de')",
    },
    rubric: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          points: { type: "number" },
        },
        required: ["item", "points"],
        additionalProperties: false,
      },
    },
    expected_answer: { type: "string" },
  },
  required: ["detected_language", "rubric", "expected_answer"],
  additionalProperties: false,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rubricGenerationSchema = jsonSchema<RubricGenerationResult>(rubricGenerationSchemaShape as any);

export interface RubricOnlyResult {
  detected_language: string;
  rubric: RubricItem[];
}

const rubricOnlyShape = {
  type: "object",
  properties: {
    detected_language: { type: "string" },
    rubric: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          points: { type: "number" },
        },
        required: ["item", "points"],
        additionalProperties: false,
      },
    },
  },
  required: ["detected_language", "rubric"],
  additionalProperties: false,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rubricOnlySchema = jsonSchema<RubricOnlyResult>(rubricOnlyShape as any);

export interface ExpectedOnlyResult {
  detected_language: string;
  expected_answer: string;
}

const expectedOnlyShape = {
  type: "object",
  properties: {
    detected_language: { type: "string" },
    expected_answer: { type: "string" },
  },
  required: ["detected_language", "expected_answer"],
  additionalProperties: false,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const expectedOnlySchema = jsonSchema<ExpectedOnlyResult>(expectedOnlyShape as any);
