/**
 * Teacher-authored "Feedback focus" areas.
 *
 * Each area is a title + description: the title becomes a section title in the
 * generated feedback document, and the description tells the AI what that section
 * should cover. Each activity type ships a default list (see the activity
 * registry) that pre-populates the editor; teachers add/edit/remove from there.
 *
 * Pure / client-safe (no registry import — the registry imports *this* for the
 * type, so keeping this leaf-level avoids a circular dependency).
 */

export interface FeedbackFocusArea {
  /** Becomes the feedback_output section title. */
  title: string;
  /** Guidance for what that section should cover. */
  description: string;
}

/** Fallback default areas when an activity type doesn't define its own. */
export const COMMON_DEFAULT_FEEDBACK_FOCUS_AREAS: FeedbackFocusArea[] = [
  {
    title: "Strengths",
    description:
      "Highlight what the student did well and the ideas they understood correctly.",
  },
  {
    title: "Areas to improve",
    description:
      "Point out gaps, misconceptions, or weaknesses in the response.",
  },
  {
    title: "Next steps",
    description:
      "Give concrete, actionable suggestions for how to improve.",
  },
];

/**
 * Tolerant reader for the `feedback_focus` jsonb column: accepts an array of
 * `{ title, description }`, coercing/trimming strings and dropping malformed or
 * fully-empty entries. Anything else (incl. a legacy plain string) → [].
 */
export function parseFeedbackFocusAreas(value: unknown): FeedbackFocusArea[] {
  if (!Array.isArray(value)) return [];
  const out: FeedbackFocusArea[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title : "";
    const description =
      typeof record.description === "string" ? record.description : "";
    if (title.trim() || description.trim()) out.push({ title, description });
  }
  return out;
}

/** Drop rows where both title and description are blank (used on save). */
export function normalizeFeedbackFocusAreas(
  areas: FeedbackFocusArea[],
): FeedbackFocusArea[] {
  return areas
    .map((a) => ({ title: a.title.trim(), description: a.description.trim() }))
    .filter((a) => a.title || a.description);
}

/**
 * Render the focus areas into the prompt block injected into the evaluation
 * prompt — one line per area, e.g. `- "Concept understanding": <description>`.
 * Returns "" when there are no usable areas.
 */
export function buildFeedbackFocusPromptText(
  areas: FeedbackFocusArea[],
): string {
  return normalizeFeedbackFocusAreas(areas)
    .map((a) => {
      if (a.title && a.description) return `- "${a.title}": ${a.description}`;
      if (a.title) return `- "${a.title}"`;
      return `- ${a.description}`;
    })
    .join("\n");
}
