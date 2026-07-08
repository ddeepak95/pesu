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
