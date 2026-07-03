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
  guidance: z
    .string()
    .optional()
    .describe(
      "Any specific requirement this question must satisfy beyond topic/difficulty — " +
        "e.g. a misconception the learner just showed to target, a wrong-answer pattern " +
        "to include as a distractor, or a constraint tying it to what was just discussed. " +
        "Omit when topic/difficulty already say enough.",
    ),
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
    .literal("reply")
    .describe("'reply' — the learner needs a phrase to say in response to the bot's last utterance (bulb button)."),
  botUtterance: z
    .string()
    .describe("Copy the bot's most recent spoken utterance here verbatim."),
});

export const displayContentActionInputSchema = z.object({
  kind: z.literal("display_content"),
  content: z
    .string()
    .describe(
      "The markdown to display in the content box. Use a fenced code block for code snippets (e.g. ```python\\n...\\n```).",
    ),
  title: z
    .string()
    .optional()
    .describe("Short label shown above the content, e.g. a function name or section heading."),
});

// Add future action input schemas here, then list them in actionInputSchemas.
export const actionInputSchema = z.discriminatedUnion("kind", [
  mcqActionInputSchema,
  suggestedResponseActionInputSchema,
  displayContentActionInputSchema,
  // z.object({ kind: z.literal("image"), query: z.string() }),
  // z.object({ kind: z.literal("equation"), latex: z.string() }),
]);

export type ActionInput = z.infer<typeof actionInputSchema>;
