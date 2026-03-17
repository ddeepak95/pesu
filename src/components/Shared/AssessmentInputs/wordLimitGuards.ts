import { appendInputViolationEvent } from "@/lib/queries/submissions";

/**
 * Factory for an onBeforeInput handler that blocks inserts of more than two
 * words at once and logs them as input_violation_events for the submission.
 */
export function createMoreThanTwoWordsGuard(
  submissionId?: string,
): (e: React.FormEvent<HTMLTextAreaElement>) => void {
  return (e: React.FormEvent<HTMLTextAreaElement>) => {
    const native = e.nativeEvent as unknown as {
      inputType?: string;
      data?: string | null;
    };

    if (!native || typeof native.inputType !== "string") {
      return;
    }

    const inputType = native.inputType;

    // Only care about insertion-style operations (including paste/keyboard clipboard).
    if (!inputType.startsWith("insert")) {
      return;
    }

    const rawData = native.data;

    // For some input types (e.g. multi-step compositions), data can be null.
    if (!rawData || !rawData.trim()) {
      return;
    }

    const words = rawData.trim().split(/\s+/).filter(Boolean);
    if (words.length > 2) {
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

