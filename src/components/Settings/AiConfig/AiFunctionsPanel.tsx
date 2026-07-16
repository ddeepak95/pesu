"use client";

import { CATALOG_FUNCTIONS } from "@/lib/ai/catalog/data";
import {
  mergeClassProviderStateForCatalog,
  mergeInstitutionProviderStateForCatalog,
} from "@/lib/ai/catalog/helpers";
import type {
  AiSettingsScope,
  FunctionBindingState,
  LocalAiSettingsState,
  ModelTask,
} from "@/lib/ai/catalog/types";

import AiFunctionGroupCard from "./AiFunctionGroupCard";
import AiFunctionRow from "./AiFunctionRow";

interface AiFunctionsPanelProps {
  scope: AiSettingsScope;
  state: LocalAiSettingsState;
  platformState?: LocalAiSettingsState;
  institutionState?: LocalAiSettingsState;
  allowUsePlatformDefaults?: boolean;
  allowUseInstitutionDefault?: boolean;
  /** Whether the viewer may edit app-function bindings. When false, all controls render read-only. */
  canEdit?: boolean;
  onBindingChange: (fnKey: string, binding: FunctionBindingState) => void;
  onClearBinding: (fnKey: string) => void;
  onUsePlatformFunctionDefault?: (parentKey: string, usePlatform: boolean) => void;
  onBrowseCatalogForTask: (task: ModelTask) => void;
}

export default function AiFunctionsPanel({
  scope,
  state,
  platformState,
  institutionState,
  allowUsePlatformDefaults = true,
  allowUseInstitutionDefault = true,
  canEdit = true,
  onBindingChange,
  onClearBinding,
  onUsePlatformFunctionDefault,
  onBrowseCatalogForTask,
}: AiFunctionsPanelProps) {
  const catalogState =
    scope === "class" && institutionState && platformState
      ? mergeClassProviderStateForCatalog(state, institutionState, platformState)
      : scope === "institution" && platformState
        ? mergeInstitutionProviderStateForCatalog(state, platformState)
        : state;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4">
        {CATALOG_FUNCTIONS.map((fn) =>
          fn.subFunctions?.length ? (
            <AiFunctionGroupCard
              key={fn.key}
              fn={fn}
              scope={scope}
              state={state}
              platformState={platformState}
              institutionState={institutionState}
              allowUsePlatformDefaults={allowUsePlatformDefaults}
              allowUseInstitutionDefault={allowUseInstitutionDefault}
              canEdit={canEdit}
              onBindingChange={onBindingChange}
              onClearBinding={onClearBinding}
              onUsePlatformFunctionDefault={onUsePlatformFunctionDefault}
              onBrowseCatalogForTask={onBrowseCatalogForTask}
            />
          ) : (
            <AiFunctionRow
              key={fn.key}
              fn={fn}
              scope={scope}
              state={state}
              platformState={platformState}
              institutionState={institutionState}
              allowUsePlatformDefaults={allowUsePlatformDefaults}
              allowUseInstitutionDefault={allowUseInstitutionDefault}
              providerCatalogState={catalogState}
              canEdit={canEdit}
              onBindingChange={onBindingChange}
              onUsePlatformFunctionDefault={onUsePlatformFunctionDefault}
              onBrowseCatalogForTask={onBrowseCatalogForTask}
            />
          ),
        )}
      </div>
    </section>
  );
}
