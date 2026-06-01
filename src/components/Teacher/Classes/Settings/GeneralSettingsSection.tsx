"use client";

import { useMemo, useState } from "react";
import { Class, ClassLanguageConfig } from "@/types/class";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { supportedLanguages } from "@/utils/supportedLanguages";
import { getLocaleLabel } from "@/lib/locales";
import { useMultimodalSpeechModels } from "@/hooks/swr/useMultimodalSpeechModels";
import { updateClass } from "@/lib/queries/classes";
import { useAuth } from "@/contexts/AuthContext";

interface GeneralSettingsSectionProps {
  classData: Class;
  isOwner: boolean;
  onUpdated: () => void;
}

const DEFAULT_SUPPORT_LANGUAGE = "hi";

export default function GeneralSettingsSection({
  classData,
  isOwner,
  onUpdated,
}: GeneralSettingsSectionProps) {
  const { user } = useAuth();
  const [className, setClassName] = useState(classData.name);
  const [preferredLanguage, setPreferredLanguage] = useState(
    classData.preferred_language || "en"
  );

  const initialLangConfig = classData.language_config ?? {};
  const [lockPrimaryLanguage, setLockPrimaryLanguage] = useState(
    initialLangConfig.lockPrimaryLanguage ?? false
  );
  const [supportEnabled, setSupportEnabled] = useState(
    initialLangConfig.supportLanguageEnabled ?? false
  );
  const [defaultSupportLanguage, setDefaultSupportLanguage] = useState(
    initialLangConfig.defaultSupportLanguage ?? DEFAULT_SUPPORT_LANGUAGE
  );
  const [lockSupportLanguage, setLockSupportLanguage] = useState(
    initialLangConfig.lockSupportLanguage ?? false
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Restrict the support-language picker to the locales this class's STT + TTS
  // models both support — matching what learners can actually use at runtime.
  const { data: speechModels } = useMultimodalSpeechModels(classData.id);
  const supportLanguageOptions = useMemo(() => {
    const locales = speechModels?.supportedLocales;
    if (locales && locales.length > 0) {
      return locales.map((code) => ({ value: code, label: getLocaleLabel(code) }));
    }
    // Unresolved / none configured → fall back to the full app locale list.
    return supportedLanguages.map((lang) => ({
      value: lang.code,
      label: lang.name,
    }));
  }, [speechModels]);

  const currentLangConfig: ClassLanguageConfig = {
    lockPrimaryLanguage,
    supportLanguageEnabled: supportEnabled,
    defaultSupportLanguage,
    lockSupportLanguage,
  };

  const savedLangConfig: ClassLanguageConfig = {
    lockPrimaryLanguage: initialLangConfig.lockPrimaryLanguage ?? false,
    supportLanguageEnabled: initialLangConfig.supportLanguageEnabled ?? false,
    defaultSupportLanguage:
      initialLangConfig.defaultSupportLanguage ?? DEFAULT_SUPPORT_LANGUAGE,
    lockSupportLanguage: initialLangConfig.lockSupportLanguage ?? false,
  };

  const hasChanges =
    className !== classData.name ||
    preferredLanguage !== (classData.preferred_language || "en") ||
    JSON.stringify(currentLangConfig) !== JSON.stringify(savedLangConfig);

  const handleSave = async () => {
    if (!user || !isOwner) return;

    if (!className.trim()) {
      setError("Class name is required");
      return;
    }

    if (className.trim().length < 2) {
      setError("Class name must be at least 2 characters");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await updateClass(classData.id, {
        name: className.trim(),
        preferred_language: preferredLanguage,
        language_config: currentLangConfig,
      });
      setSuccess(true);
      onUpdated();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Error updating class:", err);
      setError("Failed to update class. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
        <CardDescription>
          Basic class information and the default languages applied to new
          assignments.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isOwner && (
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            Only the class owner can edit class details.
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="className">Class Name</Label>
          <Input
            id="className"
            placeholder="e.g., Math 101"
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            disabled={!isOwner || saving}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="preferredLanguage">Primary Language</Label>
            <InfoTooltip text="The default language new assignments in this class start with. Teachers can still change it per assignment." />
          </div>
          <Select
            value={preferredLanguage}
            onValueChange={setPreferredLanguage}
            disabled={!isOwner || saving}
          >
            <SelectTrigger id="preferredLanguage">
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

          <div className="flex items-center space-x-2 pt-1">
            <Checkbox
              id="lock-primary-language"
              checked={lockPrimaryLanguage}
              onCheckedChange={(checked) =>
                setLockPrimaryLanguage(checked === true)
              }
              disabled={!isOwner || saving}
            />
            <div className="flex items-center gap-1.5">
              <Label
                htmlFor="lock-primary-language"
                className="text-sm font-medium leading-none cursor-pointer"
              >
                Lock primary language for students
              </Label>
              <InfoTooltip text="When enabled, students cannot change the primary language during the activity. New assignments inherit this lock." />
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-md border p-3">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="class-language-support" className="text-sm">
                Enable language support by default
              </Label>
              <p className="text-xs text-muted-foreground">
                Pre-enables, for new multimodal assignments, an additional
                language the tutor can re-explain a point in.
              </p>
            </div>
            <Switch
              id="class-language-support"
              checked={supportEnabled}
              onCheckedChange={setSupportEnabled}
              disabled={!isOwner || saving}
            />
          </div>

          {supportEnabled && (
            <div className="space-y-3 border-t pt-3">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="class-support-language" className="text-sm">
                    Default support language
                  </Label>
                  <InfoTooltip text="The support language pre-selected for learners on new assignments. Restricted to the languages this class's speech models support." />
                </div>
                <SearchableSelect
                  id="class-support-language"
                  value={defaultSupportLanguage}
                  onValueChange={setDefaultSupportLanguage}
                  options={supportLanguageOptions}
                  placeholder="Select a language"
                  disabled={!isOwner || saving}
                  className="w-full"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="lock-class-support-language"
                  checked={lockSupportLanguage}
                  onCheckedChange={(checked) =>
                    setLockSupportLanguage(checked === true)
                  }
                  disabled={!isOwner || saving}
                />
                <div className="flex items-center gap-1.5">
                  <Label
                    htmlFor="lock-class-support-language"
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    Lock support language for students
                  </Label>
                  <InfoTooltip text="When enabled, students cannot change the support language during the activity. New assignments inherit this lock." />
                </div>
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && (
          <p className="text-sm text-green-600">Class updated successfully.</p>
        )}

        {isOwner && (
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !hasChanges}
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
