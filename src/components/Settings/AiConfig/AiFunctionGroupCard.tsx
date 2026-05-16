"use client";

import { useMemo } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  countSubFunctionOverrides,
  institutionUsesPlatformFunctionDefault,
  mergeClassProviderStateForCatalog,
  mergeInstitutionProviderStateForCatalog,
  modelsEligibleForFunction,
} from "@/lib/ai/catalog/helpers";
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
import AiSubFunctionRow from "./AiSubFunctionRow";

interface AiFunctionGroupCardProps {
  fn: AppFunctionCatalogEntry;
  scope: AiSettingsScope;
  state: LocalAiSettingsState;
  platformState?: LocalAiSettingsState;
  institutionState?: LocalAiSettingsState;
  allowUsePlatformDefaults?: boolean;
  onBindingChange: (fnKey: string, binding: FunctionBindingState) => void;
  onClearBinding: (fnKey: string) => void;
  onUsePlatformFunctionDefault?: (parentKey: string, usePlatform: boolean) => void;
  onBrowseCatalogForTask: (task: ModelTask) => void;
}

export default function AiFunctionGroupCard({
  fn,
  scope,
  state,
  platformState,
  institutionState,
  allowUsePlatformDefaults = true,
  onBindingChange,
  onClearBinding,
  onUsePlatformFunctionDefault,
  onBrowseCatalogForTask,
}: AiFunctionGroupCardProps) {
  const comingSoon = fn.status === "coming_soon";
  const catalogState = useMemo(() => {
    if (scope === "class" && institutionState && platformState) {
      return mergeClassProviderStateForCatalog(
        state,
        institutionState,
        platformState,
      );
    }
    if (scope === "institution" && platformState) {
      return mergeInstitutionProviderStateForCatalog(state, platformState);
    }
    return state;
  }, [scope, state, platformState, institutionState]);
  const eligible = modelsEligibleForFunction(
    fn.key,
    state,
    scope,
    catalogState,
  );
  const subFunctions = fn.subFunctions ?? [];
  const overrideCount = countSubFunctionOverrides(state, fn.key);
  const browseCatalog = () => onBrowseCatalogForTask(fn.requiredTasks[0]!);
  const showInheritedDefaults =
    (scope === "institution" && platformState && onUsePlatformFunctionDefault) ||
    (scope === "class" &&
      institutionState &&
      platformState &&
      onUsePlatformFunctionDefault);
  const parentUsesInheritedDefault =
    showInheritedDefaults &&
    institutionUsesPlatformFunctionDefault(state, fn.key);
  const inheritLabel = scope === "class" ? "institution" : "platform";

  const bindingControls = (
    <AiFunctionBindingControls
      parentFnKey={fn.key}
      scope={scope}
      state={catalogState}
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
            <AiFunctionBrowseModelsButton onClick={browseCatalog} />
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

      {!comingSoon && (
        <>
          {showInheritedDefaults ? (
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
          )}

          {subFunctions.length > 0 && (
            <Accordion type="single" collapsible className="border-t pt-1">
              <AccordionItem value="customize" className="border-0">
                <AccordionTrigger className="py-3 text-sm hover:no-underline">
                  <span className="flex items-center gap-2">
                    {parentUsesInheritedDefault
                      ? `Per-feature assignments (${inheritLabel})`
                      : "Customize per feature"}
                    {!parentUsesInheritedDefault && overrideCount > 0 && (
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                        {overrideCount} customized
                      </span>
                    )}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-1 pt-0">
                  <div className="space-y-1">
                    {subFunctions.map((subFn) => (
                      <AiSubFunctionRow
                        key={subFn.key}
                        parentFn={fn}
                        subFn={subFn}
                        scope={scope}
                        state={state}
                        platformState={platformState}
                        institutionState={institutionState}
                        catalogState={catalogState}
                        parentUsesInheritedDefault={parentUsesInheritedDefault}
                        inheritLabel={inheritLabel}
                        onBindingChange={onBindingChange}
                        onClearBinding={onClearBinding}
                      />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </>
      )}
    </div>
  );
}
