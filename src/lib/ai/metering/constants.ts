/** Client-safe (no `server-only`) — importable from client components, mirrors credentials/constants.ts's AI_NOT_CONFIGURED_ERROR_CODE. */
export const QUOTA_EXCEEDED_ERROR_CODE = "QUOTA_EXCEEDED" as const;

/** An admin has explicitly turned off platform AI access for this institution/class — distinct from QUOTA_EXCEEDED (which is a spend cap, not an on/off switch). */
export const AI_ACCESS_DISABLED_ERROR_CODE = "AI_ACCESS_DISABLED" as const;
