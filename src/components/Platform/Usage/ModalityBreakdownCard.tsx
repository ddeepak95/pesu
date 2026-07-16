import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { modalityColorClass } from "./modalityColors";
import type { UsageBreakdownRow } from "@/lib/queries/aiUsage";

interface ModalityRow {
  dimension: string;
  value: number;
}

interface ModalityBreakdownCardProps {
  title: string;
  /** "Credits" | "Requests" */
  unitLabel: string;
  rows: UsageBreakdownRow[];
  valueKey: "credits" | "calls";
  formatValue?: (value: number) => string;
}

/**
 * "By Credits" / "By API Requests" card — a hero total plus a per-modality
 * horizontal bar comparison. Bar length is proportional to the row's share
 * of this card's own max value (credits and calls are different scales, so
 * each card scales independently) — the point is comparing modalities
 * against each other at a glance, not reading an absolute axis. Rows carry
 * per-key_owner splits (platform vs byok); this aggregates them to one
 * number per modality since the design doesn't distinguish key ownership
 * here.
 */
export default function ModalityBreakdownCard({
  title,
  unitLabel,
  rows,
  valueKey,
  formatValue = (v) => v.toLocaleString(undefined, { maximumFractionDigits: 2 }),
}: ModalityBreakdownCardProps) {
  const byModality = new Map<string, number>();
  for (const row of rows) {
    byModality.set(row.dimension, (byModality.get(row.dimension) ?? 0) + row[valueKey]);
  }
  const modalityRows: ModalityRow[] = Array.from(byModality.entries())
    .map(([dimension, value]) => ({ dimension, value }))
    .sort((a, b) => b.value - a.value);
  const total = modalityRows.reduce((sum, r) => sum + r.value, 0);
  const maxValue = modalityRows.length > 0 ? modalityRows[0]!.value : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <p className="text-2xl font-semibold">
            {formatValue(total)}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {unitLabel}
            </span>
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {modalityRows.length > 0 ? (
          <ul className="space-y-3">
            {modalityRows.map((row) => {
              const widthPercent =
                maxValue > 0 ? Math.max((row.value / maxValue) * 100, 2) : 0;
              return (
                <li key={row.dimension} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-foreground">{row.dimension}</span>
                    <span
                      className="text-muted-foreground tabular-nums"
                      title={`${formatValue(row.value)} ${unitLabel.toLowerCase()}`}
                    >
                      {formatValue(row.value)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${modalityColorClass(row.dimension)}`}
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No AI usage recorded for this period.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
