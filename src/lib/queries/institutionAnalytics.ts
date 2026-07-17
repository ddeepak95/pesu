import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Institution engagement analytics — reads through the
 * `institution_class_analytics` RPC (SECURITY DEFINER, admin-gated internally).
 * The RPC aggregates in Postgres and returns only counts, so egress stays tiny
 * regardless of how many submissions/messages underlie the numbers. Fetched
 * lazily via a server action, never on page landing.
 * See dev-docs/institution-analytics-and-logs-plan.md.
 */

/** Two-window count: all-time total and the rolling "recent" window (last 7 days). */
export interface CountPair {
  total: number;
  recent: number;
}

export interface ClassAnalyticsRow {
  classDbId: string;
  className: string;
  classCreatedAt: string;
  /** Formative assignments only. */
  activities: CountPair;
  students: CountPair;
  conversationsCompleted: CountPair;
  /** Started but not completed (in-progress submissions). */
  conversationsOpen: CountPair;
  /** completed + open — denominator for the turns average. */
  conversationsTotal: number;
  /** Turn = any chat_messages row (student + assistant). */
  turns: CountPair;
  /** turns.total / conversationsTotal, guarded against divide-by-zero (0 when no conversations). */
  avgTurnsPerConversation: number;
}

export interface InstitutionAnalytics {
  /** Active classes under the institution (recent = created within the window). */
  classesAdded: CountPair;
  classes: ClassAnalyticsRow[];
}

/** Raw row shape returned by the RPC (snake_case, bigints arrive as numbers). */
interface RawAnalyticsRow {
  class_db_id: string;
  class_name: string;
  class_created_at: string;
  activities_total: number;
  activities_recent: number;
  students_total: number;
  students_recent: number;
  conversations_completed_total: number;
  conversations_completed_recent: number;
  conversations_open_total: number;
  conversations_open_recent: number;
  conversations_total: number;
  turns_total: number;
  turns_recent: number;
}

/**
 * Fetch per-class engagement analytics for an institution.
 *
 * @param sinceIso window start for the "recent" counts (e.g. now() - 7 days),
 *   computed by the caller so the window is deterministic and testable.
 */
export async function getInstitutionAnalytics(
  supabase: SupabaseClient,
  institutionId: string,
  sinceIso: string,
): Promise<InstitutionAnalytics> {
  const { data, error } = await supabase.rpc("institution_class_analytics", {
    p_institution_id: institutionId,
    p_since: sinceIso,
  });

  if (error) throw error;

  const rows = (data ?? []) as RawAnalyticsRow[];

  const classes: ClassAnalyticsRow[] = rows.map((r) => {
    const conversationsTotal = Number(r.conversations_total) || 0;
    const turnsTotal = Number(r.turns_total) || 0;
    return {
      classDbId: r.class_db_id,
      className: r.class_name,
      classCreatedAt: r.class_created_at,
      activities: {
        total: Number(r.activities_total) || 0,
        recent: Number(r.activities_recent) || 0,
      },
      students: {
        total: Number(r.students_total) || 0,
        recent: Number(r.students_recent) || 0,
      },
      conversationsCompleted: {
        total: Number(r.conversations_completed_total) || 0,
        recent: Number(r.conversations_completed_recent) || 0,
      },
      conversationsOpen: {
        total: Number(r.conversations_open_total) || 0,
        recent: Number(r.conversations_open_recent) || 0,
      },
      conversationsTotal,
      turns: {
        total: turnsTotal,
        recent: Number(r.turns_recent) || 0,
      },
      avgTurnsPerConversation:
        conversationsTotal > 0 ? turnsTotal / conversationsTotal : 0,
    };
  });

  const since = new Date(sinceIso).getTime();
  const classesAdded: CountPair = {
    total: classes.length,
    recent: classes.filter((c) => new Date(c.classCreatedAt).getTime() >= since)
      .length,
  };

  return { classesAdded, classes };
}
