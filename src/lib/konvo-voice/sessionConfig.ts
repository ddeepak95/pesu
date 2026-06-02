import type { ActivityType } from "@/lib/promptTemplates";

export interface KonvoSessionConfig {
  language: string;
  /** Second language to transcribe in parallel when language support is active. */
  supportLanguage?: string;
  activityType: ActivityType;
  sttModelId: string;
  ttsModelId: string;
  llmModelId: string;
}
