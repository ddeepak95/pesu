import useSWR from "swr";
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
