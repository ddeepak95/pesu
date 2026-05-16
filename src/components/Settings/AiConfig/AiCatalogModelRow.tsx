"use client";

import type { CatalogModelStatus, ModelCatalogEntry } from "@/lib/ai/catalog/types";

const STATUS_LABEL: Record<CatalogModelStatus, string> = {
  available: "Available",
  coming_soon: "Coming soon",
  provider_inactive: "Activate provider",
};

const STATUS_CLASS: Record<CatalogModelStatus, string> = {
  available:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  coming_soon: "border-transparent bg-muted text-muted-foreground",
  provider_inactive:
    "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
};

interface AiCatalogModelRowProps {
  model: ModelCatalogEntry;
  status: CatalogModelStatus;
  highlighted?: boolean;
}

export default function AiCatalogModelRow({
  model,
  status,
  highlighted = false,
}: AiCatalogModelRowProps) {
  const modalities = [...new Set([...model.io.inputs, ...model.io.outputs])];

  return (
    <div
      className={`rounded-md border px-3 py-2.5 text-sm ${
        highlighted ? "border-primary ring-1 ring-primary/30" : "border-border"
      } ${status === "coming_soon" ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{model.label}</p>
          <p className="font-mono text-xs text-muted-foreground">{model.id}</p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs ${STATUS_CLASS[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {modalities.map((m) => (
          <Chip key={`mod-${m}`} label={m} />
        ))}
        {model.tasks.map((t) => (
          <Chip key={`task-${t}`} label={t.replaceAll("_", " ")} variant="task" />
        ))}
        {model.apiSurface && (
          <Chip
            key="api"
            label={model.apiSurface.replaceAll("_", " ")}
            variant="muted"
          />
        )}
      </div>
    </div>
  );
}

function Chip({
  label,
  variant = "modality",
}: {
  label: string;
  variant?: "modality" | "task" | "muted";
}) {
  const cls =
    variant === "task"
      ? "bg-primary/10 text-primary"
      : variant === "muted"
        ? "bg-secondary text-secondary-foreground"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${cls}`}>
      {label}
    </span>
  );
}
