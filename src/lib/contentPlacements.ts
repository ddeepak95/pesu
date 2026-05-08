/**
 * Helpers for linked content placements (same ref_id in multiple class groups).
 */

export type ContentDuplicateMode = "copy" | "linked";

/** Stable key for grouping placements of the same underlying material. */
export function contentMaterialKey(type: string, refId: string): string {
  return `${type}:${refId}`;
}

/**
 * Keys (`type:ref_id`) that appear in more than one active/draft placement
 * in the class (linked across groups).
 */
export function linkedMaterialKeySet(items: { type: string; ref_id: string }[]): Set<string> {
  const counts = new Map<string, number>();
  for (const ci of items) {
    const k = contentMaterialKey(ci.type, ci.ref_id);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const linked = new Set<string>();
  for (const [k, n] of counts) {
    if (n > 1) linked.add(k);
  }
  return linked;
}

/** Prefer URL `groupId`, then entity authoring group, for teacher placement context. */
export function resolveTeacherPlacementGroupId(
  groupIdFromUrl: string | null,
  entityClassGroupId: string | null | undefined
): string | undefined {
  const trimmed = groupIdFromUrl?.trim();
  if (trimmed) return trimmed;
  if (entityClassGroupId) return entityClassGroupId;
  return undefined;
}

/** When more than one active/draft placement exists, removing one row should unlink only. */
export function shouldUnlinkOnlyPlacement(activePlacementCount: number): boolean {
  return activePlacementCount > 1;
}

/** User-visible message from duplicate / Supabase errors (toast + inline). */
export function contentDuplicateFailureMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}
