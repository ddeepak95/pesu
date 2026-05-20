"use client";

import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { KonvoSessionConfig } from "@/lib/prototype/konvo-voice/sessionConfig";
import {
  getLanguageLabel,
  intersectLanguageCodes,
} from "@/lib/prototype/konvo-voice/sessionCatalogShared";
import type { ActivityType } from "@/lib/promptTemplates";

interface CatalogModelOption {
  id: string;
  label: string;
  providerId: string;
}

interface SessionOptionsResponse {
  sttModels: CatalogModelOption[];
  ttsModels: CatalogModelOption[];
  llmModels: CatalogModelOption[];
}

interface KonvoVoiceSettingsProps {
  value: KonvoSessionConfig;
  onChange: (config: KonvoSessionConfig) => void;
}

function pickDefault(
  options: CatalogModelOption[],
  preferredId?: string,
): string {
  if (preferredId && options.some((o) => o.id === preferredId)) {
    return preferredId;
  }
  return options[0]?.id ?? "";
}

export function KonvoVoiceSettings({ value, onChange }: KonvoVoiceSettingsProps) {
  const [options, setOptions] = useState<SessionOptionsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/prototype/konvo-voice/session-options");
        const body = (await res.json()) as SessionOptionsResponse & {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(body.error ?? "Failed to load session options");
        }
        if (!cancelled) {
          setOptions(body);
          setLoadError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "Failed to load session options",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const optionsInitialized = useMemo(() => Boolean(options), [options]);

  const selectableLlmIds = useMemo(
    () => options?.llmModels.map((m) => m.id) ?? [],
    [options?.llmModels],
  );

  useEffect(() => {
    if (!options) return;
    const sttModelId = pickDefault(options.sttModels, value.sttModelId);
    const ttsModelId = pickDefault(options.ttsModels, value.ttsModelId);
    const llmModelId = pickDefault(options.llmModels, value.llmModelId);
    const languages = intersectLanguageCodes(
      sttModelId,
      ttsModelId,
      llmModelId,
      selectableLlmIds,
    );
    const language = languages.includes(value.language)
      ? value.language
      : (languages[0] ?? "en");

    if (
      sttModelId !== value.sttModelId ||
      ttsModelId !== value.ttsModelId ||
      llmModelId !== value.llmModelId ||
      language !== value.language
    ) {
      onChange({
        ...value,
        sttModelId,
        ttsModelId,
        llmModelId,
        language,
      });
    }
    // Sync defaults once session-options loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when options arrive
  }, [optionsInitialized]);

  const languageOptions = useMemo(
    () =>
      intersectLanguageCodes(
        value.sttModelId,
        value.ttsModelId,
        value.llmModelId,
        selectableLlmIds,
      ),
    [value.sttModelId, value.ttsModelId, value.llmModelId, selectableLlmIds],
  );

  const canConfigure = Boolean(options) && !loadError;

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="konvo-activity">Activity type</Label>
        <Select
          value={value.activityType}
          onValueChange={(v) =>
            onChange({ ...value, activityType: v as ActivityType })
          }
          disabled={!canConfigure}
        >
          <SelectTrigger id="konvo-activity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="learning">Learning</SelectItem>
            <SelectItem value="assessment">Assessment</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="konvo-stt">Speech-to-text</Label>
        <Select
          value={value.sttModelId}
          onValueChange={(sttModelId) => {
            const languages = intersectLanguageCodes(
              sttModelId,
              value.ttsModelId,
              value.llmModelId,
              selectableLlmIds,
            );
            onChange({
              ...value,
              sttModelId,
              language: languages.includes(value.language)
                ? value.language
                : (languages[0] ?? value.language),
            });
          }}
          disabled={!canConfigure || !options?.sttModels.length}
        >
          <SelectTrigger id="konvo-stt">
            <SelectValue placeholder="Select STT model" />
          </SelectTrigger>
          <SelectContent>
            {options?.sttModels.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="konvo-tts">Text-to-speech</Label>
        <Select
          value={value.ttsModelId}
          onValueChange={(ttsModelId) => {
            const languages = intersectLanguageCodes(
              value.sttModelId,
              ttsModelId,
              value.llmModelId,
              selectableLlmIds,
            );
            onChange({
              ...value,
              ttsModelId,
              language: languages.includes(value.language)
                ? value.language
                : (languages[0] ?? value.language),
            });
          }}
          disabled={!canConfigure || !options?.ttsModels.length}
        >
          <SelectTrigger id="konvo-tts">
            <SelectValue placeholder="Select TTS model" />
          </SelectTrigger>
          <SelectContent>
            {options?.ttsModels.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="konvo-llm">Language model</Label>
        <Select
          value={value.llmModelId}
          onValueChange={(llmModelId) => {
            const languages = intersectLanguageCodes(
              value.sttModelId,
              value.ttsModelId,
              llmModelId,
              selectableLlmIds,
            );
            onChange({
              ...value,
              llmModelId,
              language: languages.includes(value.language)
                ? value.language
                : (languages[0] ?? value.language),
            });
          }}
          disabled={!canConfigure || !options?.llmModels.length}
        >
          <SelectTrigger id="konvo-llm">
            <SelectValue placeholder="Select LLM" />
          </SelectTrigger>
          <SelectContent>
            {options?.llmModels.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="konvo-language">Dialogue language</Label>
        <Select
          value={value.language}
          onValueChange={(language) => onChange({ ...value, language })}
          disabled={!canConfigure || languageOptions.length === 0}
        >
          <SelectTrigger id="konvo-language">
            <SelectValue placeholder="Select language" />
          </SelectTrigger>
          <SelectContent>
            {languageOptions.map((code) => (
              <SelectItem key={code} value={code}>
                {getLanguageLabel(code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">
        Using API keys from environment (prototype mode). TTS voice is chosen
        per language in{" "}
        <code className="text-[0.7rem]">konvoLocaleCapabilities.ts</code>.
      </p>
    </div>
  );
}
