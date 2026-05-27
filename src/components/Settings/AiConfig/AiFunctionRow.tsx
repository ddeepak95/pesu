"use client";

import { modelsEligibleForFunction } from "@/lib/ai/catalog/helpers";
import type {
  AiSettingsScope,
  AppFunctionCatalogEntry,
  FunctionBindingState,
  LocalAiSettingsState,
  ModelTask,
} from "@/lib/ai/catalog/types";

import AiFunctionBindingControls from "./AiFunctionBindingControls";
import AiFunctionBrowseModelsButton from "./AiFunctionBrowseModelsButton";
import AiInstitutionFunctionDefaultSection from "./AiInstitutionFunctionDefaultSection";

interface AiFunctionRowProps {
  fn: AppFunctionCatalogEntry;
  scope: AiSettingsScope;
  state: LocalAiSettingsState;
  platformState?: LocalAiSettingsState;
  institutionState?: LocalAiSettingsState;
  allowUsePlatformDefaults?: boolean;
  providerCatalogState?: LocalAiSettingsState;
  onBindingChange: (fnKey: string, binding: FunctionBindingState) => void;
  onUsePlatformFunctionDefault?: (parentKey: string, usePlatform: boolean) => void;
  onBrowseCatalogForTask: (task: ModelTask) => void;
}

/** Flat function card (no sub-features). */
export default function AiFunctionRow({
  fn,
  scope,
  state,
  platformState,
  institutionState,
  allowUsePlatformDefaults = true,
  providerCatalogState,
  onBindingChange,
  onUsePlatformFunctionDefault,
  onBrowseCatalogForTask,
}: AiFunctionRowProps) {
  const comingSoon = fn.status === "coming_soon";
  const eligible = modelsEligibleForFunction(
    fn.key,
    state,
    scope,
    providerCatalogState,
  );
  const showInheritedDefaults =
    (scope === "institution" && platformState && onUsePlatformFunctionDefault) ||
    (scope === "class" &&
      institutionState &&
      platformState &&
      onUsePlatformFunctionDefault);
  const inheritLabel = scope === "class" ? "institution" : "platform";

  const bindingControls = (
    <AiFunctionBindingControls
      parentFnKey={fn.key}
      scope={scope}
      state={providerCatalogState ?? state}
      binding={state.functions[fn.key]}
      onBindingChange={(binding) => onBindingChange(fn.key, binding)}
    />
  );

  return (
    <div
      className={`w-full rounded-lg border p-4 space-y-3 ${
        comingSoon ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-medium">{fn.label}</h4>
            <AiFunctionBrowseModelsButton
              onClick={() => onBrowseCatalogForTask(fn.requiredTasks[0]!)}
            />
          </div>
          <p className="text-sm text-muted-foreground">{fn.description}</p>
          {fn.consumers && fn.consumers.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Used by: {fn.consumers.join(", ")}
            </p>
          )}
        </div>
        {comingSoon ? (
          <span className="rounded-md border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Coming soon
          </span>
        ) : eligible.length === 0 ? (
          <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-300">
            Activate a provider
          </span>
        ) : null}
      </div>

      {!comingSoon &&
        (showInheritedDefaults ? (
          <AiInstitutionFunctionDefaultSection
            fn={fn}
            scopeState={state}
            platformState={platformState!}
            institutionState={institutionState}
            inheritLabel={inheritLabel}
            allowUsePlatformDefaults={allowUsePlatformDefaults}
            onUsePlatformChange={(usePlatform) =>
              onUsePlatformFunctionDefault!(fn.key, usePlatform)
            }
          >
            {bindingControls}
          </AiInstitutionFunctionDefaultSection>
        ) : (
          bindingControls
        ))}
    </div>
  );
}
