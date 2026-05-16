"use client";

import { useMemo, useState } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATALOG_MODELS } from "@/lib/ai/catalog/data";
import {
  filterCatalogModels,
  getCatalogModelStatus,
  groupCatalog,
  groupModelsByClass,
  groupModelsByModality,
  groupModelsByProvider,
} from "@/lib/ai/catalog/helpers";
import type {
  AiSettingsScope,
  CatalogBrowseMode,
  LocalAiSettingsState,
  ModelCatalogEntry,
  ModelTask,
} from "@/lib/ai/catalog/types";

import AiCatalogModelRow from "./AiCatalogModelRow";

interface AiModelCatalogExplorerProps {
  scope: AiSettingsScope;
  state: LocalAiSettingsState;
  catalogFilterTask?: ModelTask;
  highlightModelId?: string | null;
}

export default function AiModelCatalogExplorer({
  scope,
  state,
  catalogFilterTask,
  highlightModelId = null,
}: AiModelCatalogExplorerProps) {
  const [browseMode, setBrowseMode] = useState<CatalogBrowseMode>("provider");

  const models = useMemo(() => {
    if (catalogFilterTask) {
      return filterCatalogModels({ task: catalogFilterTask });
    }
    return CATALOG_MODELS;
  }, [catalogFilterTask]);

  const grouped = useMemo(
    () => groupCatalog(models, browseMode),
    [models, browseMode],
  );

  return (
    <div className="space-y-4" id="ai-model-catalog">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-medium">Model catalog</h3>
          <p className="text-sm text-muted-foreground">
            All models supported by the product, grouped for discovery. Keys are
            configured in Providers above.
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">View by</Label>
          <Select
            value={browseMode}
            onValueChange={(v) => setBrowseMode(v as CatalogBrowseMode)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="provider">Provider</SelectItem>
              <SelectItem value="category">Category</SelectItem>
              <SelectItem value="modality">Modality</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {catalogFilterTask && (
        <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-2">
          Filtered to models that support{" "}
          <span className="font-medium">
            {catalogFilterTask.replaceAll("_", " ")}
          </span>
        </p>
      )}

      {browseMode === "provider" && (
        <ProviderTree
          rows={grouped as ReturnType<typeof groupModelsByProvider>}
          scope={scope}
          state={state}
          highlightModelId={highlightModelId}
        />
      )}
      {browseMode === "category" && (
        <CategoryTree
          rows={grouped as ReturnType<typeof groupModelsByClass>}
          scope={scope}
          state={state}
          highlightModelId={highlightModelId}
        />
      )}
      {browseMode === "modality" && (
        <ModalityTree
          rows={grouped as ReturnType<typeof groupModelsByModality>}
          scope={scope}
          state={state}
          highlightModelId={highlightModelId}
        />
      )}
    </div>
  );
}

function ModelList({
  models,
  scope,
  state,
  highlightModelId,
}: {
  models: ModelCatalogEntry[];
  scope: AiSettingsScope;
  state: LocalAiSettingsState;
  highlightModelId: string | null;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {models.map((model) => (
        <AiCatalogModelRow
          key={model.id}
          model={model}
          status={getCatalogModelStatus(model, state, scope)}
          highlighted={highlightModelId === model.id}
        />
      ))}
    </div>
  );
}

function ProviderTree({
  rows,
  scope,
  state,
  highlightModelId,
}: {
  rows: ReturnType<typeof groupModelsByProvider>;
  scope: AiSettingsScope;
  state: LocalAiSettingsState;
  highlightModelId: string | null;
}) {
  return (
    <div className="space-y-6">
      {rows.map(({ provider, classes }) => (
        <div key={provider.id} className="space-y-3">
          <h4 className="font-medium">{provider.label}</h4>
          {classes.map(({ label, models }) => (
            <div
              key={label}
              className="space-y-2 border-l-2 border-muted pl-2"
            >
              <p className="text-sm text-muted-foreground">{label}</p>
              <ModelList
                models={models}
                scope={scope}
                state={state}
                highlightModelId={highlightModelId}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CategoryTree({
  rows,
  scope,
  state,
  highlightModelId,
}: {
  rows: ReturnType<typeof groupModelsByClass>;
  scope: AiSettingsScope;
  state: LocalAiSettingsState;
  highlightModelId: string | null;
}) {
  return (
    <div className="space-y-6">
      {rows.map(({ label, providers }) => (
        <div key={label} className="space-y-3">
          <h4 className="font-medium">{label}</h4>
          {providers.map(({ provider, models }) => (
            <div
              key={provider.id}
              className="space-y-2 border-l-2 border-muted pl-2"
            >
              <p className="text-sm text-muted-foreground">{provider.label}</p>
              <ModelList
                models={models}
                scope={scope}
                state={state}
                highlightModelId={highlightModelId}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ModalityTree({
  rows,
  scope,
  state,
  highlightModelId,
}: {
  rows: ReturnType<typeof groupModelsByModality>;
  scope: AiSettingsScope;
  state: LocalAiSettingsState;
  highlightModelId: string | null;
}) {
  return (
    <div className="space-y-6">
      {rows.map(({ modality, models }) => (
        <div key={modality} className="space-y-2">
          <h4 className="font-medium capitalize">{modality}</h4>
          <ModelList
            models={models}
            scope={scope}
            state={state}
            highlightModelId={highlightModelId}
          />
        </div>
      ))}
    </div>
  );
}
