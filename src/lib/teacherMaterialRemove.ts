import type { ContentItemType } from "@/types/contentItem";
import {
  countContentItemPlacementsByRef,
  getContentItemByRefId,
  softDeleteContentItem,
  softDeleteContentItemByRef,
} from "@/lib/queries/contentItems";

/**
 * Remove a material from the teacher's perspective: either unlink one group
 * placement (when multiple exist) or delete the underlying entity and all
 * placements (last placement).
 *
 * @param contentItemsAlreadyHandledWithEntity — set true for `deleteAssignment`,
 *   which already soft-deletes all `content_items` for this ref.
 */
export async function removeTeacherMaterialPlacementOrEntity(params: {
  classDbId: string;
  type: ContentItemType;
  refId: string;
  placementGroupId: string | undefined;
  deleteEntitySoft: () => Promise<void>;
  contentItemsAlreadyHandledWithEntity?: boolean;
}): Promise<void> {
  const count = await countContentItemPlacementsByRef({
    classId: params.classDbId,
    type: params.type,
    refId: params.refId,
  });
  if (count > 1) {
    const ci = await getContentItemByRefId(params.refId, params.type, {
      classGroupId: params.placementGroupId,
    });
    if (!ci) {
      throw new Error(
        "This material is linked across groups. Open it from Class Content with the correct group tab (or add ?groupId=… to the URL), then remove it again."
      );
    }
    await softDeleteContentItem(ci.id);
    return;
  }
  await params.deleteEntitySoft();
  if (!params.contentItemsAlreadyHandledWithEntity) {
    await softDeleteContentItemByRef({
      class_id: params.classDbId,
      type: params.type,
      ref_id: params.refId,
    });
  }
}
