import { CATALOG_MODELS } from "@/lib/ai/catalog/data";
import type { ModelTask } from "@/lib/ai/catalog/types";

/**
 * usage_type vocabulary — dev-docs/ai-usage-metering-plan.md §4.2.
 * Kept as an app-level registry (not a DB enum) so adding a type is a code
 * change, not a migration. `ai_invocations.usage_type` is a plain `text`
 * column; this is the source of truth for what values are valid.
 */
export type UsageType =
  | "text_generation"
  | "speech_to_text"
  | "text_to_speech"
  | "realtime_dialogue"
  | "image_generation"
  | "video_generation"
  | "embedding";

export interface UsageTypeDefinition {
  usageType: UsageType;
  label: string;
  /** Documentation only — the actual metrics captured live on ai_invocations columns/token_details. */
  billableMetrics: string[];
  status: "live" | "reserved";
}

export const USAGE_TYPE_REGISTRY: Record<UsageType, UsageTypeDefinition> = {
  text_generation: {
    usageType: "text_generation",
    label: "Foundation model",
    billableMetrics: [
      "input_token",
      "output_token",
      "cached_input_token",
      "reasoning_token",
      "audio_input_token",
      "image_input_token",
    ],
    status: "live",
  },
  speech_to_text: {
    usageType: "speech_to_text",
    label: "Speech to text",
    billableMetrics: ["audio_second"],
    status: "live",
  },
  text_to_speech: {
    usageType: "text_to_speech",
    label: "Text to speech",
    billableMetrics: ["character", "audio_output_second"],
    status: "live",
  },
  realtime_dialogue: {
    usageType: "realtime_dialogue",
    label: "Realtime dialogue",
    billableMetrics: ["session_second", "input_token", "output_token"],
    status: "reserved",
  },
  image_generation: {
    usageType: "image_generation",
    label: "Image generation",
    billableMetrics: ["image", "output_token"],
    status: "reserved",
  },
  video_generation: {
    usageType: "video_generation",
    label: "Video generation",
    billableMetrics: ["video_second"],
    status: "reserved",
  },
  embedding: {
    usageType: "embedding",
    label: "Embedding",
    billableMetrics: ["input_token"],
    status: "reserved",
  },
};

/**
 * ModelTask -> UsageType. `audio_input` is intentionally absent — it's a
 * capability (a text_generation call that also ingests audio), not its own
 * usage_type (§4.2 "two alignment rules").
 */
const TASK_TO_USAGE_TYPE: Partial<Record<ModelTask, UsageType>> = {
  text_generation: "text_generation",
  speech_to_text: "speech_to_text",
  text_to_speech: "text_to_speech",
  realtime_dialogue: "realtime_dialogue",
};

export function usageTypeForTask(task: ModelTask): UsageType | null {
  return TASK_TO_USAGE_TYPE[task] ?? null;
}

export function isKnownUsageType(value: string): value is UsageType {
  return Object.prototype.hasOwnProperty.call(USAGE_TYPE_REGISTRY, value);
}

/**
 * Build-gated (§7.3): every (model, task) pair in CATALOG_MODELS must resolve
 * to a usage_type. Throws on the first violation, naming the offending model.
 */
export function assertCatalogUsageTypesComplete(): void {
  for (const model of CATALOG_MODELS) {
    for (const task of model.tasks) {
      if (task === "audio_input") continue; // capability, not a usage_type
      const usageType = usageTypeForTask(task);
      if (!usageType) {
        throw new Error(
          `AI usage metering: catalog model "${model.id}" declares task "${task}" ` +
            `with no usage_type mapping. Add it to TASK_TO_USAGE_TYPE in ` +
            `src/lib/ai/metering/usageTypes.ts (see dev-docs/ai-usage-metering-plan.md §4.2, §7.3).`,
        );
      }
    }
  }
}
