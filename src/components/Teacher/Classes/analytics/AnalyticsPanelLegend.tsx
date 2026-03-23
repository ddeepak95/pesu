"use client";

export default function AnalyticsPanelLegend() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-green-500" />
        Completed
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
        In progress
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/40" />
        Not started
      </span>
    </div>
  );
}
