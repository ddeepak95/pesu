import type { ActivityType } from "@/lib/promptTemplates";

export interface KonvoSessionConfig {
  language: string;
  activityType: ActivityType;
  sttModelId: string;
  ttsModelId: string;
  llmModelId: string;
}
