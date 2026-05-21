import { jsonSchema } from "ai";

export type ContentKind = "image" | "video" | "article" | "chart";

export type BotSegment =
  | { type: "speech"; text: string }
  | {
      type: "content";
      kind: ContentKind;
      title: string;
      description?: string;
      url?: string;
    };

export interface BotTurnOutput {
  segments: BotSegment[];
}

const segmentSchema = {
  oneOf: [
    {
      type: "object" as const,
      properties: {
        type: { type: "string" as const, enum: ["speech"] },
        text: {
          type: "string" as const,
          description:
            "Spoken dialogue for the student (required field name: text, not content)",
        },
      },
      required: ["type", "text"] as const,
      additionalProperties: false,
    },
    {
      type: "object" as const,
      properties: {
        type: { type: "string" as const, enum: ["content"] },
        kind: {
          type: "string" as const,
          enum: ["image", "video", "article", "chart"],
        },
        title: { type: "string" as const },
        description: { type: "string" as const },
        url: { type: "string" as const },
      },
      required: ["type", "kind", "title"] as const,
      additionalProperties: false,
    },
  ],
};

const shape = {
  type: "object" as const,
  properties: {
    segments: {
      type: "array" as const,
      items: segmentSchema,
      minItems: 1,
    },
  },
  required: ["segments"] as const,
  additionalProperties: false,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const botTurnSchema = jsonSchema<BotTurnOutput>(shape as any);
