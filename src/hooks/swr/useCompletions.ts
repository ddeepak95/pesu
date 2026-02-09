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
    () => getCompletionsForStudent(contentItemIds)
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
