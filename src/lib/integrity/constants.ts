/**
 * Assignment tab-switch policy (stored on assignments.tab_switch_policy).
 */
export type TabSwitchPolicy = "allow" | "warn" | "block_after_threshold";

export const DEFAULT_TAB_SWITCH_POLICY: TabSwitchPolicy = "warn";

/** API JSON body / client handling for 403 when submission is integrity-locked */
export const INTEGRITY_ACCESS_REVOKED_ERROR_CODE = "INTEGRITY_ACCESS_REVOKED" as const;

/** Stored in submissions.integrity_access_revoked_reason when tab threshold exceeded */
export const INTEGRITY_REVOKED_REASON_TAB_SWITCH_THRESHOLD =
  "tab_switch_threshold" as const;

export type IntegrityRevokedReasonCode =
  | typeof INTEGRITY_REVOKED_REASON_TAB_SWITCH_THRESHOLD
  | string;
