import { createClient } from "@/lib/supabase";
import { ContentItem } from "@/types/contentItem";
import { nanoid } from "nanoid";

function generateContentItemId(): string {
  return nanoid(8);
}

export async function getContentItemsByClass(classDbId: string): Promise<ContentItem[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("content_items")
    .select("*")
    .eq("class_id", classDbId)
    .in("status", ["active", "draft"])
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []) as ContentItem[];
}

export async function getContentItemsByGroup(params: {
  classDbId: string;
  classGroupId: string;
}): Promise<ContentItem[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("content_items")
    .select("*")
    .eq("class_id", params.classDbId)
    .eq("class_group_id", params.classGroupId)
    .in("status", ["active", "draft"])
    // Once group positions are unique, position alone defines order.
    .order("position", { ascending: true });

  if (error) throw error;
  return (data || []) as ContentItem[];
}

export async function getNextContentItemPosition(classDbId: string): Promise<number> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("content_items")
    .select("position")
    .eq("class_id", classDbId)
    .in("status", ["active", "draft"])
    .order("position", { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const maxPos = data?.[0]?.position;
  return typeof maxPos === "number" ? maxPos + 1 : 0;
}

export async function getNextContentItemPositionByGroup(params: {
  classDbId: string;
  classGroupId: string;
}): Promise<number> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("content_items")
    .select("position")
    .eq("class_id", params.classDbId)
    .eq("class_group_id", params.classGroupId)
    .in("status", ["active", "draft"])
    .order("position", { ascending: false })
    .limit(1);

  if (error) throw error;

  const maxPos = data?.[0]?.position;
  return typeof maxPos === "number" ? maxPos + 1 : 0;
}

export async function createContentItem(
  payload: {
    class_id: string;
    class_group_id?: string | null;
    type: ContentItem["type"];
    ref_id: string;
    position?: number;
    due_at?: string | null;
    status?: ContentItem["status"];
  },
  userId: string
): Promise<ContentItem> {
  const supabase = createClient();

  const position =
    typeof payload.position === "number"
      ? payload.position
      : payload.class_group_id
        ? await getNextContentItemPositionByGroup({
            classDbId: payload.class_id,
            classGroupId: payload.class_group_id,
          })
        : await getNextContentItemPosition(payload.class_id);

  const { data, error } = await supabase
    .from("content_items")
    .insert({
      content_item_id: generateContentItemId(),
      class_id: payload.class_id,
      class_group_id: payload.class_group_id ?? null,
      type: payload.type,
      ref_id: payload.ref_id,
      position,
      due_at: payload.due_at ?? null,
      created_by: userId,
      status: payload.status ?? "active",
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as ContentItem;
}

export async function updateContentItemPositions(
  positions: Array<{ id: string; position: number }>
): Promise<void> {
  const supabase = createClient();

  if (positions.length === 0) return;

  // NOTE: don't use UPSERT here with partial rows.
  // Also, when enforcing UNIQUE (class_group_id, position), we must avoid transient collisions.
  // We do a two-phase update:
  // 1) Move all involved rows to unique temporary negative positions
  // 2) Set their final positions

  const tempResults = await Promise.all(
    positions.map(({ id }, idx) =>
      supabase
        .from("content_items")
        .update({ position: -1000000 - idx, updated_at: new Date().toISOString() })
        .eq("id", id)
    )
  );

  for (const r of tempResults) {
    if (r.error) throw r.error;
  }

  const results = await Promise.all(
    positions.map(({ id, position }) =>
      supabase
        .from("content_items")
        .update({ position, updated_at: new Date().toISOString() })
        .eq("id", id)
    )
  );

  for (const r of results) {
    if (r.error) throw r.error;
  }
}

export async function softDeleteContentItem(id: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("content_items")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw error;
  }
}

export async function softDeleteContentItemByRef(params: {
  class_id: string;
  type: ContentItem["type"];
  ref_id: string;
}): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("content_items")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .eq("class_id", params.class_id)
    .eq("type", params.type)
    .eq("ref_id", params.ref_id);

  if (error) throw error;
}

export async function updateContentItemStatusByRef(params: {
  class_id: string;
  type: ContentItem["type"];
  ref_id: string;
  status: ContentItem["status"];
}): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("content_items")
    .update({ status: params.status, updated_at: new Date().toISOString() })
    .eq("class_id", params.class_id)
    .eq("type", params.type)
    .eq("ref_id", params.ref_id);

  if (error) throw error;
}

/**
 * Get a content item by its ref_id (the UUID of the underlying entity)
 * Used to look up the content_item_id from a learning content, quiz, or assignment UUID
 */
export async function getContentItemByRefId(
  refId: string,
  type: ContentItem["type"]
): Promise<ContentItem | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("content_items")
    .select("*")
    .eq("ref_id", refId)
    .eq("type", type)
    .in("status", ["active", "draft"])
    .maybeSingle();

  if (error) {
    console.error("Error fetching content item by ref_id:", error);
    return null;
  }

  return data as ContentItem | null;
}




