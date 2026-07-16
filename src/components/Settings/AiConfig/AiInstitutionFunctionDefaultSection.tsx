"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  formatReasoningLabel,
  getModelEntry,
  getProviderEntry,
  institutionUsesPlatformFunctionDefault,
  resolveClassEffectiveFunctionBinding,
  resolveInstitutionEffectiveFunctionBinding,
} from "@/lib/ai/catalog/helpers";
import type {
  AppFunctionCatalogEntry,
  LocalAiSettingsState,
} from "@/lib/ai/catalog/types";

interface AiInstitutionFunctionDefaultSectionProps {
  fn: AppFunctionCatalogEntry;
  scopeState: LocalAiSettingsState;
  platformState: LocalAiSettingsState;
  institutionState?: LocalAiSettingsState;
  inheritLabel?: string;
  allowUsePlatformDefaults: boolean;
  onUsePlatformChange: (usePlatform: boolean) => void;
  children: React.ReactNode;
}

export default function AiInstitutionFunctionDefaultSection({
  fn,
  scopeState,
  platformState,
  institutionState,
  inheritLabel = "platform",
  allowUsePlatformDefaults,
  onUsePlatformChange,
  children,
}: AiInstitutionFunctionDefaultSectionProps) {
  const usesInherited = institutionUsesPlatformFunctionDefault(
    scopeState,
    fn.key,
  );
  const effectiveBinding =
    institutionState && inheritLabel === "institution"
      ? resolveClassEffectiveFunctionBinding(
          scopeState,
          institutionState,
          platformState,
          fn.key,
        )
      : resolveInstitutionEffectiveFunctionBinding(
          scopeState,
          platformState,
          fn.key,
        );
  const providerLabel = effectiveBinding
    ? getProviderEntry(effectiveBinding.providerId)?.label
    : null;
  const modelLabel = effectiveBinding
    ? getModelEntry(effectiveBinding.modelId)?.label
    : null;
  const reasoningLabel = effectiveBinding
    ? formatReasoningLabel(effectiveBinding)
    : null;

  return (
    <div className="space-y-3">
      {inheritLabel === "institution" && !allowUsePlatformDefaults && (
        <p className="text-xs text-muted-foreground">
          Institution AI access is off for this class — set your own
          assignment for {fn.label} below.
        </p>
      )}

      {allowUsePlatformDefaults && (
        <div className="flex items-center justify-between gap-4 rounded-md bg-muted/40 px-3 py-2">
          <Label
            htmlFor={`use-platform-fn-${fn.key}`}
            className="text-sm font-normal"
          >
            Use {inheritLabel} default for {fn.label}
          </Label>
          <Switch
            id={`use-platform-fn-${fn.key}`}
            checked={usesInherited}
            onCheckedChange={onUsePlatformChange}
          />
        </div>
      )}

      {usesInherited && allowUsePlatformDefaults ? (
        <p className="text-sm text-muted-foreground">
          {effectiveBinding && providerLabel && modelLabel ? (
            <>
              Using {inheritLabel} assignment: {providerLabel} · {modelLabel}
              {reasoningLabel ? ` · reasoning ${reasoningLabel}` : ""}
            </>
          ) : (
            <>
              No {inheritLabel} assignment configured yet. Set models on{" "}
              {inheritLabel} AI settings.
            </>
          )}
        </p>
      ) : (
        children
      )}
    </div>
  );
}
