import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * `keySource` is whose API key served the calls: 'platform' (platform-managed
 * key, spends institution credits), 'institution' (the institution's own BYOK
 * key), or 'class' (the class's own BYOK key). Kept at this granularity so a
 * class's usage card can tell an institution-provided key apart from the
 * class bringing its own.
 */
export interface UsageBreakdownRow {
  dimension: string;
  credits: number;
  calls: number;
  keySource: "platform" | "institution" | "class";
}

const SENTINEL_CLASS_ID = "00000000-0000-0000-0000-000000000000";

const USAGE_TYPE_LABELS: Record<string, string> = {
  text_generation: "Foundation model",
  speech_to_text: "Speech to text",
  text_to_speech: "Text to speech",
  realtime_dialogue: "Realtime dialogue",
  image_generation: "Image generation",
  video_generation: "Video generation",
  embedding: "Embedding",
};

export function currentMonthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

/**
 * A calendar month's spend by modality (`usage_type`), for the
 * institution-wide sentinel row or a specific class — cheap, O(1)-ish reads
 * off `ai_usage_counters` (analytics-only rollup, dev-docs/ai-usage-metering-plan.md
 * §4.5), not a scan over `ai_invocations`. `usage_type='all'` is excluded —
 * that's the cross-modality total, not a breakdown row. `periodStart`
 * defaults to the current month; pass an explicit first-of-month date
 * (see src/lib/ai/metering/usageMonths.ts) to browse a past month.
 */
export async function getMonthlyUsageByModality(
  supabase: SupabaseClient,
  input: { institutionId: string; classId?: string | null; periodStart?: string },
): Promise<UsageBreakdownRow[]> {
  const { data, error } = await supabase
    .from("ai_usage_counters")
    .select("usage_type, key_source, credits, events")
    .eq("institution_id", input.institutionId)
    .eq("class_id", input.classId ?? SENTINEL_CLASS_ID)
    .eq("period_start", input.periodStart ?? currentMonthStart())
    .neq("usage_type", "all");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    dimension: USAGE_TYPE_LABELS[row.usage_type as string] ?? (row.usage_type as string),
    keySource: row.key_source as "platform" | "institution" | "class",
    credits: Number(row.credits),
    calls: Number(row.events),
  }));
}

export interface WalletFundingEntry {
  id: string;
  type: string;
  credits: number;
  note: string | null;
  createdAt: string;
}

/** Grant/top-up/allocation history for one wallet — the ledger `ai_credit_balances.balance` is derived from. */
export async function getWalletFundingHistory(
  supabase: SupabaseClient,
  walletId: string,
  limit = 20,
): Promise<WalletFundingEntry[]> {
  const { data, error } = await supabase
    .from("ai_credit_transactions")
    .select("id, type, credits, note, created_at")
    .eq("wallet_id", walletId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    type: row.type as string,
    credits: Number(row.credits),
    note: (row.note as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}
