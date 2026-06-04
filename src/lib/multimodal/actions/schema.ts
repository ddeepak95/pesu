/**
 * Zod schemas for the action the LLM may request within a turn.
 *
 * This is the *input* to an action (what the model asks for), distinct from the
 * *payload* (the generated result streamed to the client — see ./types.ts).
 * Add new action kinds to the discriminated union here and the dispatcher will
 * route them once a handler is registered.
 */

import { z } from "zod";

export const mcqActionInputSchema = z.object({
  kind: z.literal("mcq"),
  topic: z.string().describe("The concept the question should assess."),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  repeatPrevious: z
    .boolean()
    .default(false)
    .describe(
      "Set true to re-ask the EXACT same question the learner just attempted " +
        "(e.g. after a wrong answer + hint), instead of authoring a new one.",
    ),
});

export const suggestedResponseActionInputSchema = z.object({
  kind: z.literal("suggested_response"),
  triggerKind: z
    .enum(["reply", "express"])
    .describe(
      "'reply' — the learner needs a phrase to say in response to the bot's last utterance (bulb button). " +
      "'express' — the learner asked how to say a specific idea in the target language.",
    ),
  botUtterance: z
    .string()
    .describe(
      "For triggerKind='reply': copy the bot's most recent spoken utterance here verbatim. " +
      "For triggerKind='express': the phrase or idea the learner wants to express " +
      "(e.g. if they ask 'how do I say I want tea?', put 'I want tea' here).",
    ),
});

// Add future action input schemas here, then list them in actionInputSchemas.
export const actionInputSchema = z.discriminatedUnion("kind", [
  mcqActionInputSchema,
  suggestedResponseActionInputSchema,
  // z.object({ kind: z.literal("image"), query: z.string() }),
  // z.object({ kind: z.literal("equation"), latex: z.string() }),
]);

export type ActionInput = z.infer<typeof actionInputSchema>;
