/**
 * Canonical safety directive — shared by the multimodal turn path, the retired
 * voice appendix, and the evaluation/feedback footer. All three
 * contexts previously carried independently-drifted copies of the same
 * underlying policy (students are the audience; never offensive/inappropriate/
 * sexual; keep a supportive, age-appropriate, respectful tone) — unified here
 * into one constant, worded generically enough to cover both conversational
 * output and evaluation feedback.
 *
 * Lives in its own module (rather than multimodal-directives.ts or
 * activityTypes/registry.ts) so both of those can import it without a
 * circular dependency (multimodal-directives.ts already imports from
 * registry.ts for getActivityTypeDefinition).
 */
export const SAFETY_DIRECTIVE =
  "SAFETY: The users are students. Never include anything offensive, inappropriate, or " +
  "sexual in your responses. Always keep a supportive, age-appropriate, and respectful tone.";
