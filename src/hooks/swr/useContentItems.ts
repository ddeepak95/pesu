import useSWR from "swr";
import {
  getContentItemsByGroup,
} from "@/lib/queries/contentItems";
import { ContentItem } from "@/types/contentItem";

/**
 * Fetch content items for a specific group within a class
 */
export function useContentItemsByGroup(
  classDbId: string | null,
  classGroupId: string | null
) {
  return useSWR<ContentItem[]>(
    classDbId && classGroupId
      ? ["contentItemsByGroup", classDbId, classGroupId]
      : null,
    () =>
      getContentItemsByGroup({
        classDbId: classDbId!,
        classGroupId: classGroupId!,
      })
  );
}
