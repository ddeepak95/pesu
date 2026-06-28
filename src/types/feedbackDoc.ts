/**
 * Structured block-based feedback document.
 *
 * Feedback is a flat list of titled `section` blocks, each holding a single
 * `content` string. Section titles are dynamic (the AI generates them from the
 * activity type + teacher's "feedback focus"). There is no parser: the structure
 * is valid by construction, so a teacher's text edit can at worst show literal
 * characters, never break layout.
 *
 * The rubric breakdown is NOT part of this document — it always renders last,
 * from the `rubric_scores` data (single source of truth), so scores are never
 * duplicated or desynced. The doc only carries the narrative sections.
 *
 * `content` is plain text today (rendered with newlines preserved). The optional
 * `format` discriminator is forward-compat for WYSIWYG: when a Markdown-backed
 * editor (TipTap/Lexical) lands, the same string carries `"markdown"`/`"html"`
 * and the renderer gains a branch — no schema or migration change. We
 * deliberately store a serialized string (AI-friendly), not a node-tree JSON.
 *
 * `kind` is retained on each block (and the renderer switches on it) so further
 * block types can be added later without reshaping stored docs.
 *
 * Pure / client-safe (no server-only imports): used by the AI output schema, the
 * evaluator, the student renderer, and the teacher editor alike.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schemas (source of truth for the TS types + runtime validation)
// ---------------------------------------------------------------------------

/** Serialization of a section's `content` string. Absent ⇒ "text" (today's only mode). */
export const CONTENT_FORMATS = ["text", "markdown", "html"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

/** A titled section with a single content string — the only block type today. */
export const feedbackBlockSchema = z.object({
  kind: z.literal("section"),
  title: z.string(),
  content: z.string(),
  format: z.enum(CONTENT_FORMATS).optional(),
});

export const feedbackDocSchema = z.object({
  version: z.literal(1),
  blocks: z.array(feedbackBlockSchema),
});

export type FeedbackBlock = z.infer<typeof feedbackBlockSchema>;
export type FeedbackDoc = z.infer<typeof feedbackDocSchema>;

/** Block kinds a teacher can add. (The rubric breakdown is appended automatically.) */
export const FEEDBACK_BLOCK_KINDS = ["section"] as const;
export type FeedbackBlockKind = (typeof FEEDBACK_BLOCK_KINDS)[number];

// ---------------------------------------------------------------------------
// JSON Schema for the LLM output (the evaluation schema uses raw jsonSchema()).
// ---------------------------------------------------------------------------

// Discriminants use single-value `enum` (rather than `const`) for the widest
// compatibility with strict structured-output modes.
const sectionJsonSchema = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["section"] },
    title: { type: "string" },
    content: { type: "string" },
    // Forward-compat only; the prompt keeps content plain text, so the AI
    // leaves this unset today. `format` is a string field, so its `enum` is
    // safe under Gemini's enum-only-on-strings constraint.
    format: { type: "string", enum: [...CONTENT_FORMATS] },
  },
  required: ["kind", "title", "content"],
  additionalProperties: false,
} as const;

/** JSON Schema fragment for a `FeedbackDoc`, embedded into the evaluation schema. */
export const feedbackDocJsonSchema = {
  type: "object",
  properties: {
    // Gemini only allows `enum` on string fields, so we leave version as a plain
    // integer here; the Zod schema still pins it to exactly 1 on validation.
    version: { type: "integer" },
    blocks: { type: "array", items: sectionJsonSchema },
  },
  required: ["version", "blocks"],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse/validate an unknown value into a FeedbackDoc, or null if invalid. */
export function validateFeedbackDoc(value: unknown): FeedbackDoc | null {
  const result = feedbackDocSchema.safeParse(value);
  return result.success ? result.data : null;
}

/** Wrap plain text in a minimal single-section document (legacy fallback). */
export function feedbackDocFromText(text: string): FeedbackDoc {
  return {
    version: 1,
    blocks: text.trim() ? [{ kind: "section", title: "", content: text }] : [],
  };
}

/**
 * Flatten a document to plain text — stored in the `feedback` text column for
 * backward compat, search, and the legacy fallback render. The rubric breakdown
 * is not part of the doc (it renders from rubric_scores), so nothing to skip.
 */
export function flattenFeedbackDoc(doc: FeedbackDoc | null | undefined): string {
  if (!doc) return "";
  const parts: string[] = [];
  for (const block of doc.blocks) {
    const content = block.content.trim();
    parts.push(block.title ? `${block.title}\n${content}` : content);
  }
  return parts.filter((p) => p.trim()).join("\n\n");
}

/** True when the document has at least one block that renders something. */
export function feedbackDocHasContent(doc: FeedbackDoc | null | undefined): boolean {
  return !!doc && doc.blocks.length > 0;
}

// ---------------------------------------------------------------------------
// Empty-block factories (typed structural editing — always schema-valid)
// ---------------------------------------------------------------------------

/** A new, empty, schema-valid top-level block of the given kind. */
export function emptyBlock(_kind: FeedbackBlockKind = "section"): FeedbackBlock {
  return { kind: "section", title: "", content: "" };
}
