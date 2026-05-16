"use client";

import { useMemo } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CATALOG_PROVIDERS, MODEL_CLASS_LABEL } from "@/lib/ai/catalog/data";
import {
  filterCatalogModels,
  formatModelReasoningCapabilities,
  getCatalogModelStatus,
  getProviderEntry,
} from "@/lib/ai/catalog/helpers";
import type {
  AiSettingsScope,
  CatalogModelStatus,
  LocalAiSettingsState,
  ModelCatalogEntry,
  ModelTask,
  ProviderId,
} from "@/lib/ai/catalog/types";

const STATUS_LABEL: Record<CatalogModelStatus, string> = {
  available: "Available",
  coming_soon: "Coming soon",
  provider_inactive: "Activate provider",
};

interface AiModelCatalogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: AiSettingsScope;
  state: LocalAiSettingsState;
  providerId?: ProviderId;
  catalogFilterTask?: ModelTask;
  highlightModelId?: string | null;
}

export default function AiModelCatalogDialog({
  open,
  onOpenChange,
  scope,
  state,
  providerId,
  catalogFilterTask,
  highlightModelId = null,
}: AiModelCatalogDialogProps) {
  const providerGroups = useMemo(() => {
    const providers = providerId
      ? CATALOG_PROVIDERS.filter((p) => p.id === providerId)
      : CATALOG_PROVIDERS;

    return providers
      .map((provider) => ({
        provider,
        models: filterCatalogModels({
          providerId: provider.id,
          task: catalogFilterTask,
        }),
      }))
      .filter((group) => group.models.length > 0);
  }, [providerId, catalogFilterTask]);

  const totalModels = providerGroups.reduce(
    (n, g) => n + g.models.length,
    0,
  );

  const providerLabel = providerId
    ? getProviderEntry(providerId)?.label
    : null;

  const title = providerLabel
    ? `${providerLabel} models`
    : catalogFilterTask
      ? "Models for this function"
      : "Model catalog";

  const description = providerLabel
    ? "Models available from this provider in the product catalog."
    : catalogFilterTask
      ? `Showing models that support ${catalogFilterTask.replaceAll("_", " ")}.`
      : "All providers and models supported by the product.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto border-t px-6 pb-6">
          {totalModels === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No models match this filter.
            </p>
          ) : (
            <div className="space-y-6 pt-4">
              {providerGroups.map(({ provider, models }) => (
                <section key={provider.id} className="space-y-2">
                  <div>
                    <h4 className="text-sm font-medium">{provider.label}</h4>
                    <p className="text-xs text-muted-foreground">
                      {provider.description}
                    </p>
                  </div>
                  <ModelTable
                    models={models}
                    state={state}
                    scope={scope}
                    highlightModelId={highlightModelId}
                  />
                </section>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModelTable({
  models,
  state,
  scope,
  highlightModelId,
}: {
  models: ModelCatalogEntry[];
  state: LocalAiSettingsState;
  scope: AiSettingsScope;
  highlightModelId: string | null;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Model</th>
            <th className="px-3 py-2 font-medium">ID</th>
            <th className="px-3 py-2 font-medium">Category</th>
            <th className="px-3 py-2 font-medium">Modalities</th>
            <th className="px-3 py-2 font-medium">Tasks</th>
            <th className="px-3 py-2 font-medium">Reasoning</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => {
            const status = getCatalogModelStatus(model, state, scope);
            const modalities = [
              ...new Set([...model.io.inputs, ...model.io.outputs]),
            ];
            const highlighted = highlightModelId === model.id;
            return (
              <tr
                key={model.id}
                className={`border-t ${highlighted ? "bg-primary/5" : ""}`}
              >
                <td className="px-3 py-2 font-medium">{model.label}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {model.id}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {MODEL_CLASS_LABEL[model.modelClass]}
                </td>
                <td className="px-3 py-2">
                  <ChipList items={modalities} />
                </td>
                <td className="px-3 py-2">
                  <ChipList
                    items={model.tasks.map((t) => t.replaceAll("_", " "))}
                    variant="task"
                  />
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {formatModelReasoningCapabilities(model)}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChipList({
  items,
  variant = "default",
}: {
  items: string[];
  variant?: "default" | "task";
}) {
  if (items.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item}
          className={`rounded px-1.5 py-0.5 text-xs capitalize ${
            variant === "task"
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: CatalogModelStatus }) {
  const cls =
    status === "available"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : status === "coming_soon"
        ? "bg-muted text-muted-foreground"
        : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs ${cls}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
