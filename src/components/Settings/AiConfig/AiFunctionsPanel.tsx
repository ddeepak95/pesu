"use client";

import { CATALOG_FUNCTIONS } from "@/lib/ai/catalog/data";
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
  onBindingChange,
  onClearBinding,
  onUsePlatformFunctionDefault,
  onBrowseCatalogForTask,
}: AiFunctionsPanelProps) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-base font-medium">App functions</h3>
        <p className="text-sm text-muted-foreground">
          Set a default provider and model for each feature group. Expand
          &ldquo;Customize per feature&rdquo; only when a specific feature needs
          its own model.
        </p>
      </div>
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
              onBindingChange={onBindingChange}
              onBrowseCatalogForTask={onBrowseCatalogForTask}
            />
          ),
        )}
      </div>
    </section>
  );
}
