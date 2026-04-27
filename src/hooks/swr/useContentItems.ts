import useSWR from "swr";
import {
  getContentItemByRefId,
  getContentItemsByClass,
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

/**
 * Fetch a content item by the underlying ref_id and type.
 */
export function useContentItemByRefId(
  refId: string | null,
  type: ContentItem["type"] | null
) {
  return useSWR<ContentItem | null>(
    refId && type ? ["contentItemByRefId", type, refId] : null,
    () => getContentItemByRefId(refId!, type!)
  );
}

/**
 * Fetch every content item for a class.
 */
export function useContentItemsByClass(classDbId: string | null) {
  return useSWR<ContentItem[]>(
    classDbId ? ["contentItemsByClass", classDbId] : null,
    () => getContentItemsByClass(classDbId!)
  );
}
