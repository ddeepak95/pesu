import useSWR, { mutate } from "swr";
import { getCompletionsForStudent } from "@/lib/queries/contentCompletions";

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
    }
  );
}

/**
 * Invalidate all cached completions so the next render fetches fresh data.
 * Call this after markContentAsComplete() to keep the class page in sync.
 */
export function invalidateCompletionsCache() {
  return mutate(
    (key) => Array.isArray(key) && key[0] === "completionsForStudent"
  );
}
