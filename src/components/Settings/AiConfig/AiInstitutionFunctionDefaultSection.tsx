"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  formatReasoningLabel,
  getModelEntry,
  getProviderEntry,
  institutionUsesPlatformFunctionDefault,
  isProviderActive,
  resolveClassEffectiveFunctionBinding,
  resolveInstitutionEffectiveFunctionBinding,
} from "@/lib/ai/catalog/helpers";
import type {
  AiSettingsScope,
  AppFunctionCatalogEntry,
  LocalAiSettingsState,
} from "@/lib/ai/catalog/types";

interface AiInstitutionFunctionDefaultSectionProps {
  fn: AppFunctionCatalogEntry;
  scope: AiSettingsScope;
  scopeState: LocalAiSettingsState;
  platformState: LocalAiSettingsState;
  institutionState?: LocalAiSettingsState;
  catalogState?: LocalAiSettingsState;
  inheritLabel?: string;
  allowUsePlatformDefaults: boolean;
  canEdit?: boolean;
  onUsePlatformChange: (usePlatform: boolean) => void;
  children: React.ReactNode;
}

export default function AiInstitutionFunctionDefaultSection({
  fn,
  scope,
  scopeState,
  platformState,
  institutionState,
  catalogState,
  inheritLabel = "platform",
  allowUsePlatformDefaults,
  canEdit = true,
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
  const providerInactive = Boolean(
    effectiveBinding &&
      catalogState &&
      !isProviderActive(catalogState, effectiveBinding.providerId, scope),
  );

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
            disabled={!canEdit}
          />
        </div>
      )}

      {usesInherited && allowUsePlatformDefaults ? (
        <p className="text-sm text-muted-foreground">
          {effectiveBinding && providerLabel && modelLabel ? (
            <>
              Using {inheritLabel} assignment: {providerLabel} · {modelLabel}
              {reasoningLabel ? ` · reasoning ${reasoningLabel}` : ""}
              {providerInactive && (
                <span className="ml-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-800 dark:text-amber-300">
                  {providerLabel} is off
                </span>
              )}
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
