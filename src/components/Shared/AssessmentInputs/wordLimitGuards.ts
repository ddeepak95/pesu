import { appendInputViolationEvent } from "@/lib/queries/submissions";

export type BulkInputGuardResult = { allowed: boolean; nextValue: string };

export interface BulkInputGuard {
  guard: (newValue: string) => BulkInputGuardResult;
  sync: (value: string) => void;
}

/**
 * Extracts the inserted substring between two values using a simple diff.
 */
function extractInserted(oldVal: string, newVal: string): string {
  let start = 0;
  while (
    start < oldVal.length &&
    start < newVal.length &&
    oldVal[start] === newVal[start]
  ) {
    start++;
  }

  let endOld = oldVal.length - 1;
  let endNew = newVal.length - 1;
  while (
    endOld >= start &&
    endNew >= start &&
    oldVal[endOld] === newVal[endNew]
  ) {
    endOld--;
    endNew--;
  }

  return newVal.slice(start, endNew + 1);
}

const VIOLATION_ACCUMULATION_MS = 500;
const VIOLATION_EXTEND_MS = 300;

/**
 * Logs bulk text insertion (and optionally reports it) by tracking how many
 * characters are added within a sliding time window. When the threshold is
 * exceeded, violation accumulation mode captures all further insertions for
 * a short period so the full attempted text (including IME chunks) is logged
 * once. Does not block input — all entry is always allowed.
 */
export function createBulkInputGuard(
  submissionId?: string,
  maxChars: number = 50,
  windowMs: number = 1500,
): BulkInputGuard {
  let lastValue = "";
  let windowStart = 0;
  let charsInWindow = 0;
  let valueBeforeWindow = "";
  let burstBuffer = "";
  let lastLogTime = 0;

  // Violation accumulation: capture full burst across multiple IME events
  let violationModeUntil = 0;
  let violationBuffer = "";
  let violationRevertTo = "";

  const clearViolationState = () => {
    violationModeUntil = 0;
    violationBuffer = "";
    violationRevertTo = "";
  };

  const logViolation = (text: string) => {
    if (!text) return;
    const now = Date.now();
    if (now - lastLogTime < 1000) return;
    lastLogTime = now;

    console.warn("[BulkInputGuard] Detected bulk input:", text.length, "chars →", text);

    if (submissionId) {
      appendInputViolationEvent(submissionId, {
        timestamp: new Date().toISOString(),
        text,
      });
    }
  };

  const guard = (newValue: string): BulkInputGuardResult => {
    const now = Date.now();
    const delta = newValue.length - lastValue.length;

    // Violation accumulation window just expired — log full buffer once
    if (violationModeUntil > 0 && now >= violationModeUntil) {
      logViolation(violationBuffer);
      clearViolationState();
    }

    // Deletion or no-change — always allow, reset window and violation state
    if (delta <= 0) {
      lastValue = newValue;
      charsInWindow = 0;
      valueBeforeWindow = newValue;
      burstBuffer = "";
      clearViolationState();
      return { allowed: true, nextValue: newValue };
    }

    // Still in violation accumulation window — append chunk, allow entry, log later
    if (violationModeUntil > 0 && now < violationModeUntil) {
      violationBuffer += extractInserted(lastValue, newValue);
      violationModeUntil = now + VIOLATION_EXTEND_MS;
      lastValue = newValue;
      return { allowed: true, nextValue: newValue };
    }

    // Start a new main window if the previous one expired
    if (now - windowStart > windowMs) {
      charsInWindow = 0;
      valueBeforeWindow = lastValue;
      burstBuffer = "";
      clearViolationState();
      windowStart = now;
    }

    burstBuffer += extractInserted(lastValue, newValue);
    charsInWindow += delta;

    if (charsInWindow > maxChars) {
      violationModeUntil = now + VIOLATION_ACCUMULATION_MS;
      violationBuffer = burstBuffer;
      violationRevertTo = valueBeforeWindow;
      charsInWindow = 0;
      valueBeforeWindow = violationRevertTo;
      burstBuffer = "";
      lastValue = newValue;
      return { allowed: true, nextValue: newValue };
    }

    lastValue = newValue;
    return { allowed: true, nextValue: newValue };
  };

  const sync = (value: string) => {
    lastValue = value;
    charsInWindow = 0;
    valueBeforeWindow = value;
    burstBuffer = "";
    clearViolationState();
  };

  return { guard, sync };
}
