import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityTypeKind } from "@/lib/activityTypes/types";

/** Assignment → class mapping is immutable; cache per warm server instance. */
const globalStore = globalThis as typeof globalThis & {
  __assignmentClassCache?: Map<string, string>;
};

function getCache(): Map<string, string> {
  if (!globalStore.__assignmentClassCache) {
    globalStore.__assignmentClassCache = new Map();
  }
  return globalStore.__assignmentClassCache;
}

export async function getClassDbIdForAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
): Promise<string | null> {
  const cache = getCache();
  const cached = cache.get(assignmentId);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("assignments")
    .select("class_id")
    .eq("assignment_id", assignmentId)
    .single();

  if (error || !data?.class_id) {
    return null;
  }

  const classDbId = data.class_id as string;
  cache.set(assignmentId, classDbId);
  return classDbId;
}

export async function getActivityTypeForAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
): Promise<ActivityTypeKind> {
  const { data, error } = await supabase
    .from("assignments")
    .select("activity_type")
    .eq("assignment_id", assignmentId)
    .single();

  if (error || !data?.activity_type) {
    return "learning";
  }

  return data.activity_type as ActivityTypeKind;
}
