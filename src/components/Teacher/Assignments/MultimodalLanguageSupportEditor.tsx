"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import { getLocaleLabel } from "@/lib/locales";
import { APP_LOCALES } from "@/lib/locales/registry";
import type {
  LanguageSupportConfig,
  MultimodalActionsConfig,
} from "@/lib/multimodal/turnConfig";
import type { BotPromptConfig } from "@/types/assignment";

interface MultimodalLanguageSupportEditorProps {
  config: BotPromptConfig;
  onChange: (config: BotPromptConfig) => void;
  /**
   * Locales the class's STT + TTS models both support. When provided, the
   * support-language picker is restricted to these (matches what learners see).
   * Undefined (unresolved) falls back to the full app locale list.
   */
  supportedLocales?: string[];
  disabled?: boolean;
  /** View-mode display: the language dropdown skips the dimmed/disabled look. */
  readOnly?: boolean;
}

const DEFAULT_SUPPORT_LANGUAGE = "hi";

export function MultimodalLanguageSupportEditor({
  config,
  onChange,
  supportedLocales,
  disabled,
  readOnly = false,
}: MultimodalLanguageSupportEditorProps) {
  const actions: MultimodalActionsConfig = config.multimodal_actions ?? {};
  const languageSupport: LanguageSupportConfig = actions.languageSupport ?? {};

  const languageOptions = (
    supportedLocales && supportedLocales.length > 0
      ? supportedLocales
      : APP_LOCALES.map((locale) => locale.locale)
  ).map((code) => ({ value: code, label: getLocaleLabel(code) }));

  const updateLanguageSupport = (patch: Partial<LanguageSupportConfig>) => {
    onChange({
      ...config,
      multimodal_actions: {
        ...actions,
        languageSupport: { ...languageSupport, ...patch },
      },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="language-support-toggle" className="text-sm">
            Enable language support
          </Label>
          <InfoTooltip text="Lets the tutor offer help in an additional language (and write feedback in it) when the learner needs it. In multimodal activities, learners can also ask the tutor to re-explain in this language." />
        </div>
        <Switch
          id="language-support-toggle"
          checked={languageSupport.enabled ?? false}
          onCheckedChange={(on) => updateLanguageSupport({ enabled: on })}
          disabled={disabled}
        />
      </div>

      {languageSupport.enabled && (
        <div className="space-y-3 border-t pt-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="support-language" className="text-sm">
                Default support language
              </Label>
              <InfoTooltip text="The support language pre-selected for learners. Learners can change it unless you lock it below." />
            </div>
            <SearchableSelect
              id="support-language"
              value={languageSupport.defaultLanguage ?? DEFAULT_SUPPORT_LANGUAGE}
              onValueChange={(value) =>
                updateLanguageSupport({ defaultLanguage: value })
              }
              options={languageOptions}
              placeholder="Select a language"
              disabled={disabled}
              readOnly={readOnly}
              className="w-[220px]"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="lock-support-language"
              checked={languageSupport.locked ?? false}
              onCheckedChange={(checked) =>
                updateLanguageSupport({ locked: checked === true })
              }
              disabled={disabled}
            />
            <div className="flex items-center gap-1.5">
              <Label
                htmlFor="lock-support-language"
                className="text-sm font-medium leading-none cursor-pointer"
              >
                Lock support language for students
              </Label>
              <InfoTooltip text="When enabled, students cannot change the support language during the activity." />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
