import type { SupabaseClient } from "@supabase/supabase-js";

export interface AppLogRow {
  id: string;
  created_at: string;
  level: "info" | "warn" | "error";
  source: string;
  event: string;
  error_code: string | null;
  message: string | null;
  institution_id: string | null;
  class_id: string | null;
  activity_type: string | null;
  activity_id: string | null;
  submission_id: string | null;
  question_order: number | null;
  user_id: string | null;
  ai_invocation_id: string | null;
  metadata: Record<string, unknown>;
}

export interface AppLogFilters {
  level?: "info" | "warn" | "error";
  source?: string;
  institutionId?: string;
  classId?: string;
  limit?: number;
}

/**
 * Read app_logs through the caller's RLS-scoped client — the "Admins read app
 * logs" policy already filters to the rows the viewer may see (super admin: all;
 * institution admin: their institution). Filters are additional narrowing on
 * top of that. See dev-docs/ai-retry-and-failure-recovery-plan.md §8.
 */
export async function listAppLogs(
  supabase: SupabaseClient,
  filters: AppLogFilters = {},
): Promise<AppLogRow[]> {
  let query = supabase
    .from("app_logs")
    .select(
      "id, created_at, level, source, event, error_code, message, institution_id, class_id, activity_type, activity_id, submission_id, question_order, user_id, ai_invocation_id, metadata",
    )
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.level) query = query.eq("level", filters.level);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.institutionId)
    query = query.eq("institution_id", filters.institutionId);
  if (filters.classId) query = query.eq("class_id", filters.classId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AppLogRow[];
}
