/**
 * Registry of client-checkable error codes returned by /api/multimodal/* routes.
 * Add new multimodal error cases here rather than inventing an ad hoc string at
 * the call site — keeps the client's error-branch list and the server's list of
 * possible codes in the same place. See dev-docs/multimodal-interaction-config-plan.md §3i.
 */
export const MULTIMODAL_ERROR_CODES = {
  AUDIO_INPUT_CAPABILITY_MISMATCH: "AUDIO_INPUT_CAPABILITY_MISMATCH",
} as const;

export type MultimodalErrorCode =
  (typeof MULTIMODAL_ERROR_CODES)[keyof typeof MULTIMODAL_ERROR_CODES];
