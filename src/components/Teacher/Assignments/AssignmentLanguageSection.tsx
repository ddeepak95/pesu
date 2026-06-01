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
}: AssignmentLanguageSectionProps) {
  return (
    <div className="space-y-4 pt-4">
      {/* Primary Language */}
      <SettingsCard className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="preferredLanguage">Primary Language</Label>
            <InfoTooltip text="The main language the AI bot speaks and interacts in with students. Students can change it during the assessment unless you lock it below." />
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
              Lock primary language for students
            </Label>
            <InfoTooltip text="When enabled, students cannot change the primary language during the assessment." />
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
