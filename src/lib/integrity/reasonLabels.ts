import {
  INTEGRITY_REVOKED_REASON_TAB_SWITCH_THRESHOLD,
  type IntegrityRevokedReasonCode,
} from "./constants";

/**
 * Human-readable label for teacher and student UI.
 */
export function getIntegrityRevokedLabel(
  reason: IntegrityRevokedReasonCode | null | undefined,
): string {
  if (!reason) {
    return "Integrity policy";
  }
  switch (reason) {
    case INTEGRITY_REVOKED_REASON_TAB_SWITCH_THRESHOLD:
      return "Exceeded allowed tab switches";
    default:
      return "Integrity policy";
  }
}
