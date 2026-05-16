"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  formatReasoningLabel,
  getModelEntry,
  getProviderEntry,
  hasSubFunctionOverride,
  resolveClassEffectiveFunctionBinding,
  resolveInstitutionEffectiveFunctionBinding,
  resolveFunctionBinding,
  subFunctionBindingKey,
} from "@/lib/ai/catalog/helpers";
import type {
  AiSettingsScope,
  AppFunctionCatalogEntry,
  AppSubFunctionCatalogEntry,
  FunctionBindingState,
  LocalAiSettingsState,
} from "@/lib/ai/catalog/types";

import AiFunctionBindingControls from "./AiFunctionBindingControls";

interface AiSubFunctionRowProps {
  parentFn: AppFunctionCatalogEntry;
  subFn: AppSubFunctionCatalogEntry;
  scope: AiSettingsScope;
  state: LocalAiSettingsState;
  platformState?: LocalAiSettingsState;
  institutionState?: LocalAiSettingsState;
  catalogState?: LocalAiSettingsState;
  parentUsesInheritedDefault?: boolean;
  inheritLabel?: string;
  onBindingChange: (fnKey: string, binding: FunctionBindingState) => void;
  onClearBinding: (fnKey: string) => void;
}

function formatBindingLine(binding: FunctionBindingState | undefined) {
  if (!binding) return null;
  const provider = getProviderEntry(binding.providerId)?.label;
  const model = getModelEntry(binding.modelId)?.label;
  const reasoning = formatReasoningLabel(binding);
  if (!provider || !model) return null;
  return `${provider} · ${model}${reasoning ? ` · reasoning ${reasoning}` : ""}`;
}

export default function AiSubFunctionRow({
  parentFn,
  subFn,
  scope,
  state,
  platformState,
  institutionState,
  catalogState,
  parentUsesInheritedDefault = false,
  inheritLabel = "platform",
  onBindingChange,
  onClearBinding,
}: AiSubFunctionRowProps) {
  const bindingKey = subFunctionBindingKey(parentFn.key, subFn.key);
  const hasOverride = hasSubFunctionOverride(state, parentFn.key, subFn.key);
  const [isCustomizing, setIsCustomizing] = useState(false);

  const effectiveBinding =
    scope === "class" && institutionState && platformState
      ? resolveClassEffectiveFunctionBinding(
          state,
          institutionState,
          platformState,
          parentFn.key,
          subFn.key,
        )
      : scope === "institution" && platformState
        ? resolveInstitutionEffectiveFunctionBinding(
            state,
            platformState,
            parentFn.key,
            subFn.key,
          )
        : resolveFunctionBinding(state, parentFn.key, subFn.key);

  const parentBinding =
    scope === "class" && institutionState && platformState
      ? resolveClassEffectiveFunctionBinding(
          state,
          institutionState,
          platformState,
          parentFn.key,
        )
      : scope === "institution" && platformState
        ? resolveInstitutionEffectiveFunctionBinding(
            state,
            platformState,
            parentFn.key,
          )
        : resolveFunctionBinding(state, parentFn.key);

  const controlsState = catalogState ?? state;
  const showControls =
    hasOverride || (isCustomizing && !parentUsesInheritedDefault);
  const effectiveLine = formatBindingLine(effectiveBinding);
  const parentDefaultLine = formatBindingLine(parentBinding);

  const handleBindingChange = (binding: FunctionBindingState) => {
    onBindingChange(bindingKey, binding);
    if (!hasOverride) setIsCustomizing(true);
  };

  const handleReset = () => {
    onClearBinding(bindingKey);
    setIsCustomizing(false);
  };

  return (
    <div className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0">
      <div>
        <h5 className="text-sm font-medium">{subFn.label}</h5>
        <p className="text-xs text-muted-foreground">{subFn.description}</p>
        {subFn.consumers && subFn.consumers.length > 0 && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Used by: {subFn.consumers.join(", ")}
          </p>
        )}
      </div>

      {showControls ? (
        <div className="space-y-2">
          <AiFunctionBindingControls
            parentFnKey={parentFn.key}
            scope={scope}
            state={controlsState}
            binding={state.functions[bindingKey]}
            onBindingChange={handleBindingChange}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleReset}
          >
            Reset to default
          </Button>
        </div>
      ) : parentUsesInheritedDefault ? (
        <p className="text-xs text-muted-foreground">
          Using {inheritLabel} default
          {effectiveLine ? ` · ${effectiveLine}` : ""}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">
            Using {parentFn.label} default
            {parentDefaultLine ? ` · ${parentDefaultLine}` : ""}
          </p>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-xs"
            onClick={() => setIsCustomizing(true)}
          >
            Customize
          </Button>
        </div>
      )}
    </div>
  );
}
