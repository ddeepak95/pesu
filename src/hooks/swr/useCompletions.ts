import useSWR, { mutate } from "swr";
import {
  getCompletionsForStudent,
  getCompletionsWithDatesForStudent,
} from "@/lib/queries/contentCompletions";

/**
 * Fetch content completions for the current student across a set of content item IDs.
 * Returns a Set<string> of completed content item IDs.
 */
export function useCompletionsForStudent(contentItemIds: string[]) {
  const sortedKey =
    contentItemIds.length > 0 ? [...contentItemIds].sort().join(",") : null;
  return useSWR<Set<string>>(
    sortedKey ? ["completionsForStudent", sortedKey] : null,
    () => getCompletionsForStudent(contentItemIds),
    {
      // Always refetch on mount so the class page picks up completions
      // made on detail pages. Override the global dedupingInterval which
      // can cause stale data when navigating back quickly.
      dedupingInterval: 0,
      // SWR's default stableHash cannot compare Set objects (all Sets
      // serialize to "{}"), so it never detects changes. Provide a
      // proper Set comparison so re-renders fire when contents differ.
      compare: (a, b) => {
        if (a === b) return true;
        if (!a || !b || a.size !== b.size) return false;
        for (const item of a) {
          if (!b.has(item)) return false;
        }
        return true;
      },
    }
  );
}

/**
 * Fetch content completions with dates for the current student.
 * Returns a Map of content_item_id -> completed_at (ISO string) for unlock logic.
 */
export function useCompletionsWithDatesForStudent(contentItemIds: string[]) {
  const sortedKey =
    contentItemIds.length > 0 ? [...contentItemIds].sort().join(",") : null;
  return useSWR<Map<string, string>>(
    sortedKey ? ["completionsWithDatesForStudent", sortedKey] : null,
    () => getCompletionsWithDatesForStudent(contentItemIds),
    {
      dedupingInterval: 0,
      compare: (a, b) => {
        if (a === b) return true;
        if (!a || !b || a.size !== b.size) return false;
        for (const [k, v] of a) {
          if (b.get(k) !== v) return false;
        }
        return true;
      },
    }
  );
}

/**
 * Invalidate all cached completions so the next render fetches fresh data.
 * Call this after markContentAsComplete() to keep the class page in sync.
 */
export function invalidateCompletionsCache() {
  return mutate(
    (key) =>
      Array.isArray(key) &&
      (key[0] === "completionsForStudent" ||
        key[0] === "completionsWithDatesForStudent")
  );
}
