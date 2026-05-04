import { useMemo } from "react";
import useSWR, { mutate } from "swr";
import {
  getContentItemByRefId,
  getContentItemsByClass,
  getContentItemsByGroup,
} from "@/lib/queries/contentItems";
import { contentMaterialKey, linkedMaterialKeySet } from "@/lib/contentPlacements";
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
 * Pass `classGroupId` when the same material may be placed in multiple groups.
 */
export function useContentItemByRefId(
  refId: string | null,
  type: ContentItem["type"] | null,
  classGroupId?: string | null
) {
  return useSWR<ContentItem | null>(
    refId && type
      ? ["contentItemByRefId", type, refId, classGroupId ?? ""]
      : null,
    () => getContentItemByRefId(refId!, type!, { classGroupId: classGroupId ?? undefined })
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

export function invalidateContentItemsByGroup(classDbId: string, classGroupId: string) {
  return mutate(["contentItemsByGroup", classDbId, classGroupId]);
}

export function invalidateContentItemsByClass(classDbId: string) {
  return mutate(["contentItemsByClass", classDbId]);
}

/**
 * True when this material has more than one active/draft placement in the class
 * (linked across groups).
 */
export function useMaterialLinkedAcrossGroups(
  classDbId: string | null,
  type: ContentItem["type"] | null,
  refId: string | null
): boolean {
  const { data } = useContentItemsByClass(classDbId);
  return useMemo(() => {
    if (!classDbId || !type || !refId || !data?.length) return false;
    return linkedMaterialKeySet(data).has(contentMaterialKey(type, refId));
  }, [classDbId, type, refId, data]);
}
