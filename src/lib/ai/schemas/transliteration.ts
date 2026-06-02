import { jsonSchema } from "ai";

export interface TransliterationResult {
  transliteration: string | null;
  translation: string;
}

const transliterationSchemaShape = {
  type: "object",
  properties: {
    transliteration: {
      type: ["string", "null"],
      description:
        "Phonetic rendering of the source text in the support language's native script. Null when both languages share the same script.",
    },
    translation: {
      type: "string",
      description: "Meaning translated into the support language, written in its native script.",
    },
  },
  required: ["transliteration", "translation"],
  additionalProperties: false,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const transliterationSchema = jsonSchema<TransliterationResult>(transliterationSchemaShape as any);
