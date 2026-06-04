"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Label } from "@/components/ui/label";
import { SettingsCard } from "@/components/ui/settings-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultimodalLanguageSupportEditor } from "@/components/Teacher/Assignments/MultimodalLanguageSupportEditor";
import { supportedLanguages } from "@/utils/supportedLanguages";
import type { ActivityTypeKind } from "@/lib/activityTypes/types";
import type { BotPromptConfig } from "@/types/assignment";

interface AssignmentLanguageSectionProps {
  preferredLanguage: string;
  setPreferredLanguage: (lang: string) => void;
  lockLanguage: boolean;
  setLockLanguage: (lock: boolean) => void;
  botPromptConfig: BotPromptConfig;
  setBotPromptConfig: (config: BotPromptConfig) => void;
  supportedLocales?: string[];
  loading: boolean;
  activityType?: ActivityTypeKind;
}

/**
 * Top-level language configuration for an assignment: primary language (+ lock)
 * and support language. Shown for every interaction type — the support language
 * feeds the {{support_language}} prompt variable, and learners can use it in
 * multimodal mode to ask the tutor to re-explain.
 */
export function AssignmentLanguageSection({
  preferredLanguage,
  setPreferredLanguage,
  lockLanguage,
  setLockLanguage,
  botPromptConfig,
  setBotPromptConfig,
  supportedLocales,
  loading,
  activityType,
}: AssignmentLanguageSectionProps) {
  const isSpeakingPractice = activityType === "speaking_practice";
  const primaryLanguageLabel = isSpeakingPractice ? "Learning Language" : "Primary Language";
  const primaryLanguageTooltip = isSpeakingPractice
    ? "The language students are learning and will speak during the role-play. Students can change it unless you lock it below."
    : "The main language the AI bot speaks and interacts in with students. Students can change it during the assessment unless you lock it below.";
  const lockLabel = isSpeakingPractice
    ? "Lock learning language for students"
    : "Lock primary language for students";
  const lockTooltip = isSpeakingPractice
    ? "When enabled, students cannot change the learning language during the activity."
    : "When enabled, students cannot change the primary language during the assessment.";

  return (
    <div className="space-y-4 pt-4">
      {/* Primary / Learning Language */}
      <SettingsCard className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="preferredLanguage">{primaryLanguageLabel}</Label>
            <InfoTooltip text={primaryLanguageTooltip} />
          </div>
          <Select
            value={preferredLanguage}
            onValueChange={setPreferredLanguage}
            disabled={loading}
          >
            <SelectTrigger id="preferredLanguage" className="w-[220px]">
              <SelectValue placeholder="Select a language" />
            </SelectTrigger>
            <SelectContent>
              {supportedLanguages.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="lockLanguage"
            checked={lockLanguage}
            onCheckedChange={(checked) => setLockLanguage(checked === true)}
            disabled={loading}
          />
          <div className="flex items-center gap-1.5">
            <Label
              htmlFor="lockLanguage"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              {lockLabel}
            </Label>
            <InfoTooltip text={lockTooltip} />
          </div>
        </div>
      </SettingsCard>

      {/* Support Language */}
      <SettingsCard className="space-y-3">
        <MultimodalLanguageSupportEditor
          config={botPromptConfig}
          onChange={setBotPromptConfig}
          supportedLocales={supportedLocales}
          disabled={loading}
        />
      </SettingsCard>
    </div>
  );
}
