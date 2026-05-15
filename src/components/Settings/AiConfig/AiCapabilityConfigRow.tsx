"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { invalidateAiConfigCache } from "@/hooks/swr/useAiCapabilityConfigs";
import {
  clearClassAiConfigOverrideAction,
  upsertClassAiConfigAction,
  upsertInstitutionAiConfigAction,
  upsertPlatformAiConfigAction,
} from "@/lib/ai/credentials/actions";
import { aiConfigCapabilities } from "@/lib/ai/credentials/capabilities";
import {
  getAiCapabilityDefinition,
  TEXT_CAPABILITY_KEY,
  type AiCapabilityDefinition,
  resolveAiProvider,
  resolveGoogleModelId,
} from "@/lib/ai/capabilities/registry";
import type { ViewerRole } from "@/lib/settings/capabilities";
import type {
  EffectiveAiCapabilityMeta,
  EffectiveAiConfigs,
} from "@/types/aiCapabilityConfig";

import AiConfigEffectiveBadge from "./AiConfigEffectiveBadge";
import AiConfigSourceControl from "./AiConfigSourceControl";
import AiCapabilityConfigEditor, {
  type AiCapabilityConfigEditorValues,
} from "./AiCapabilityConfigEditor";

export type AiConfigListMode = "platform" | "institution" | "class";

interface AiCapabilityConfigRowProps {
  mode: AiConfigListMode;
  effective: EffectiveAiConfigs;
  viewerRole: ViewerRole;
  scopeId: string;
  classShortId?: string | null;
  institutionEffectiveMeta?: EffectiveAiCapabilityMeta;
}

function initialEditorValues(
  def: AiCapabilityDefinition,
  meta: EffectiveAiCapabilityMeta,
): AiCapabilityConfigEditorValues {
  const provider = resolveAiProvider(meta.provider);
  return {
    provider,
    modelId: resolveGoogleModelId(meta.modelId, def.defaultModelId),
    apiKey: "",
  };
}

export default function AiCapabilityConfigRow({
  mode,
  effective,
  viewerRole,
  scopeId,
  classShortId = null,
  institutionEffectiveMeta,
}: AiCapabilityConfigRowProps) {
  const def = getAiCapabilityDefinition(TEXT_CAPABILITY_KEY);
  const meta = effective.capabilities[TEXT_CAPABILITY_KEY];
  const policy = effective.institutionPolicy;
  const platformDefaultsAllowed = policy.allowUsePlatformDefaults;

  const caps = aiConfigCapabilities({
    viewerRole,
    mode: mode === "platform" ? "platform" : mode,
    institutionPolicy: policy,
  });

  const useCustom = useMemo(() => {
    if (mode === "platform") return true;
    if (mode === "institution") {
      if (!platformDefaultsAllowed) return true;
      return !meta.usePlatformDefault;
    }
    return meta.hasClassOverride;
  }, [mode, meta.usePlatformDefault, meta.hasClassOverride, platformDefaultsAllowed]);

  const [customEnabled, setCustomEnabled] = useState(useCustom);
  const [editor, setEditor] = useState(() => initialEditorValues(def, meta));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const disabled =
    pending ||
    (mode === "platform" && !caps.canEditPlatform) ||
    (mode === "institution" && !caps.canEditInstitutionValue) ||
    (mode === "class" && !caps.canEditClassOverride);

  const canSave =
    (mode === "platform" && caps.canEditPlatform) ||
    (mode === "institution" && caps.canEditInstitutionValue) ||
    (mode === "class" && caps.canEditClassOverride);

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const payload = customEnabled
        ? {
            usePlatformDefault: false as const,
            provider: editor.provider,
            modelId: editor.modelId,
            apiKey: editor.apiKey || undefined,
          }
        : { usePlatformDefault: true as const };

      let result;
      if (mode === "platform") {
        if (!customEnabled) {
          setError("Platform must have custom text AI configuration");
          return;
        }
        result = await upsertPlatformAiConfigAction({
          payload: {
            usePlatformDefault: false,
            provider: editor.provider,
            modelId: editor.modelId,
            apiKey: editor.apiKey || undefined,
          },
        });
        if (result.ok) invalidateAiConfigCache("platform");
      } else if (mode === "institution") {
        result = await upsertInstitutionAiConfigAction({
          institutionId: scopeId,
          payload,
        });
        if (result.ok) invalidateAiConfigCache("institution", scopeId);
      } else {
        if (!customEnabled) {
          result = await clearClassAiConfigOverrideAction({
            classDbId: scopeId,
            classShortId,
          });
        } else {
          result = await upsertClassAiConfigAction({
            classDbId: scopeId,
            classShortId,
            payload,
          });
        }
        if (result.ok) invalidateAiConfigCache("class", scopeId);
      }

      if (!result?.ok) {
        setError(result?.error ?? "Failed to save");
        return;
      }
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
    });
  };

  const showPlatformSourceToggle =
    mode === "institution" && platformDefaultsAllowed;
  const showSourceControl = mode === "class" || showPlatformSourceToggle;

  const showEditor =
    mode === "platform" ||
    (mode === "institution" && (!platformDefaultsAllowed || customEnabled)) ||
    (mode === "class" && customEnabled);

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-medium">{def.label}</h4>
          <p className="text-sm text-muted-foreground">{def.description}</p>
        </div>
        {mode === "class" && institutionEffectiveMeta && !customEnabled && (
          <AiConfigEffectiveBadge meta={institutionEffectiveMeta} />
        )}
        {mode === "institution" && !customEnabled && (
          <AiConfigEffectiveBadge meta={meta} />
        )}
      </div>

      {mode === "institution" && !platformDefaultsAllowed && (
        <p className="text-sm text-muted-foreground">
          Platform defaults are disabled for this institution. Configure a
          custom API key for text-based AI.
        </p>
      )}

      {showSourceControl && (
        <AiConfigSourceControl
          mode={mode === "institution" ? "institution" : "class"}
          useCustom={customEnabled}
          onUseCustomChange={setCustomEnabled}
          disabled={disabled}
        />
      )}

      {showEditor && (
        <AiCapabilityConfigEditor
          definition={def}
          values={editor}
          onChange={setEditor}
          disabled={disabled}
          allowEmptyKey={meta.hasKey || mode !== "platform"}
          existingKeyHint={meta.keyHint}
        />
      )}

      {canSave && (
        <div className="flex items-center gap-3">
          <Button type="button" size="sm" onClick={handleSave} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
          {savedAt && (
            <span className="text-sm text-muted-foreground">Saved</span>
          )}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      )}
    </div>
  );
}
