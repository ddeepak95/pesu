import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiClassOverridePolicy } from "@/types/aiSettings";
import { DEFAULT_AI_CLASS_OVERRIDE_POLICY } from "@/types/aiSettings";

interface AiClassSettingsRow {
  class_id: string;
  allow_child_override: boolean;
}

function rowToPolicy(row: AiClassSettingsRow | null): AiClassOverridePolicy {
  if (!row) return { ...DEFAULT_AI_CLASS_OVERRIDE_POLICY };
  return {
    allowChildOverride: row.allow_child_override,
  };
}

/**
 * `ai_class_settings.ai_access_enabled` — the class-level AI kill switch
 * (dev-docs/ai-usage-metering-phase4-plan.md decision 1). No row for this
 * class means the default, unrestricted `true` (fail-open, matches the
 * column's DB default and every pre-existing class's current behavior).
 */
export async function getClassAiAccessEnabled(
  supabase: SupabaseClient,
  classId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("ai_class_settings")
    .select("ai_access_enabled")
    .eq("class_id", classId)
    .maybeSingle();
  if (error) throw error;
  return (data?.ai_access_enabled as boolean | undefined) ?? true;
}

/** Bulk read for a "does this class allow AI access" badge across every class in an institution. Missing rows default to true (fail-open). */
export async function getClassAiAccessEnabledMap(
  supabase: SupabaseClient,
  classIds: string[],
): Promise<Record<string, boolean>> {
  if (classIds.length === 0) return {};
  const { data, error } = await supabase
    .from("ai_class_settings")
    .select("class_id, ai_access_enabled")
    .in("class_id", classIds);
  if (error) throw error;
  const result: Record<string, boolean> = Object.fromEntries(
    classIds.map((id) => [id, true]),
  );
  for (const row of data ?? []) {
    result[row.class_id as string] = row.ai_access_enabled as boolean;
  }
  return result;
}

export async function setClassAiAccessEnabled(
  supabase: SupabaseClient,
  classId: string,
  enabled: boolean,
  updatedBy: string,
): Promise<void> {
  const { error } = await supabase.from("ai_class_settings").upsert(
    {
      class_id: classId,
      ai_access_enabled: enabled,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "class_id" },
  );
  if (error) throw error;
}

export async function getClassAiOverride(
  supabase: SupabaseClient,
  classId: string,
): Promise<AiClassOverridePolicy> {
  const { data, error } = await supabase
    .from("ai_class_settings")
    .select("class_id, allow_child_override")
    .eq("class_id", classId)
    .maybeSingle();
  if (error) throw error;
  return rowToPolicy((data ?? null) as AiClassSettingsRow | null);
}

export async function setClassAiOverride(
  supabase: SupabaseClient,
  classId: string,
  allowChildOverride: boolean,
  updatedBy: string,
): Promise<void> {
  const { error } = await supabase.from("ai_class_settings").upsert(
    {
      class_id: classId,
      allow_child_override: allowChildOverride,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "class_id" },
  );
  if (error) throw error;
}
