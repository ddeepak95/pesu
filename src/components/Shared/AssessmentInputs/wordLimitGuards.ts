import { appendInputViolationEvent } from "@/lib/queries/submissions";

/**
 * Factory for an onBeforeInput handler that treats "bulk insertion"
 * as a violation when more than 15 characters are inserted within
 * a 1-second rolling window. Intended to catch clipboard/IME inserts.
 */
export function createMoreThanTwoWordsGuard(
  submissionId?: string,
): (e: React.FormEvent<HTMLTextAreaElement>) => void {
  // Per-textarea rolling window state
  let windowStart: number | null = null;
  let windowCharCount = 0;

  return (e: React.FormEvent<HTMLTextAreaElement>) => {
    const native = e.nativeEvent as unknown as {
      inputType?: string;
      data?: string | null;
    };

    if (!native || typeof native.inputType !== "string") {
      return;
    }

    const inputType = native.inputType;

    // Only care about insertion-style operations (including paste/clipboard/IME).
    if (!inputType.startsWith("insert")) {
      return;
    }

    const rawData = native.data;
    if (!rawData || !rawData.trim()) {
      return;
    }

    const now = Date.now();
    const len = rawData.length;

    if (windowStart === null || now - windowStart > 1000) {
      // Start a new 1-second window
      windowStart = now;
      windowCharCount = len;
    } else {
      // Accumulate characters within the current window
      windowCharCount += len;
    }

    if (windowCharCount > 15) {
      e.preventDefault();

      if (submissionId) {
        appendInputViolationEvent(submissionId, {
          timestamp: new Date().toISOString(),
          text: rawData,
        });
      }
    }
  };
}

