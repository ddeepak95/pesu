import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { modalityColorClass } from "./modalityColors";
import type { UsageBreakdownRow } from "@/lib/queries/aiUsage";

interface ModalityRow {
  dimension: string;
  platform: number;
  byok: number;
  total: number;
}

/**
 * Diagonal "Lines" hatch (45°), inked tone-on-tone over the segment's own
 * fill — the BYOK segment is the same modality hue as Platform, textured
 * rather than a second hue or a plain opacity fade, so it survives CVD,
 * grayscale, and print the same way Platform's solid fill does.
 */
const BYOK_HATCH_STYLE = {
  backgroundImage:
    "repeating-linear-gradient(45deg, rgba(0,0,0,0.45) 0px, rgba(0,0,0,0.45) 2px, transparent 2px, transparent 5px)",
};

/**
 * Legend-only variant: stripes drawn in `currentColor` rather than a fixed
 * rgba, so they track the swatch's own ink color (set via `text-foreground`)
 * and stay visible against a transparent box on any surface — unlike the
 * bar's hatch, which always sits on a solid modality fill and never needs to
 * contrast against the page underneath it.
 */
const BYOK_LEGEND_HATCH_STYLE = {
  backgroundImage:
    "repeating-linear-gradient(45deg, currentColor 0px, currentColor 2px, transparent 2px, transparent 5px)",
};

interface ModalityBreakdownCardProps {
  title: string;
  /** "AI Credits" | "Requests" */
  unitLabel: string;
  rows: UsageBreakdownRow[];
  valueKey: "credits" | "calls";
  formatValue?: (value: number) => string;
}

/**
 * "By AI Credits" / "By API Requests" card — a hero total (split platform vs
 * BYOK) plus a per-modality horizontal bar comparison. Bar length is
 * proportional to the row's share of this card's own max value (credits and
 * calls are different scales, so each card scales independently) — the point
 * is comparing modalities against each other at a glance, not reading an
 * absolute axis. Each bar is itself stacked into a platform segment (solid
 * modality hue) and a BYOK segment (same hue, diagonal hatch) so key
 * ownership reads within the modality color rather than spending a second
 * hue on it — a shared legend names the two segments once for the whole
 * card.
 */
export default function ModalityBreakdownCard({
  title,
  unitLabel,
  rows,
  valueKey,
  formatValue = (v) => v.toLocaleString(undefined, { maximumFractionDigits: 2 }),
}: ModalityBreakdownCardProps) {
  const byModality = new Map<string, { platform: number; byok: number }>();
  for (const row of rows) {
    const entry = byModality.get(row.dimension) ?? { platform: 0, byok: 0 };
    entry[row.keyOwner] += row[valueKey];
    byModality.set(row.dimension, entry);
  }
  const modalityRows: ModalityRow[] = Array.from(byModality.entries())
    .map(([dimension, { platform, byok }]) => ({
      dimension,
      platform,
      byok,
      total: platform + byok,
    }))
    .sort((a, b) => b.total - a.total);
  const totalPlatform = modalityRows.reduce((sum, r) => sum + r.platform, 0);
  const totalByok = modalityRows.reduce((sum, r) => sum + r.byok, 0);
  const total = totalPlatform + totalByok;
  const maxValue = modalityRows.length > 0 ? modalityRows[0]!.total : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <div className="text-right">
            <p className="text-2xl font-semibold">
              {formatValue(total)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {unitLabel}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {formatValue(totalPlatform)} Platform · {formatValue(totalByok)} BYOK
            </p>
          </div>
        </div>
        {modalityRows.length > 0 && (
          <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 rounded-sm border border-foreground/50 bg-current text-foreground" />
              Platform
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-3.5 w-3.5 rounded-sm border border-foreground/50 bg-transparent text-foreground"
                style={BYOK_LEGEND_HATCH_STYLE}
              />
              BYOK
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {modalityRows.length > 0 ? (
          <ul className="space-y-3">
            {modalityRows.map((row) => {
              const widthPercent =
                maxValue > 0 ? Math.max((row.total / maxValue) * 100, 2) : 0;
              const colorClass = modalityColorClass(row.dimension);
              return (
                <li key={row.dimension} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-foreground">{row.dimension}</span>
                    <span
                      className="text-muted-foreground tabular-nums"
                      title={`${formatValue(row.platform)} Platform · ${formatValue(row.byok)} BYOK`}
                    >
                      {formatValue(row.total)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="flex h-full"
                      style={{ width: `${widthPercent}%` }}
                    >
                      {row.platform > 0 && (
                        <div
                          className={`h-full ${colorClass}`}
                          style={{ flexGrow: row.platform }}
                        />
                      )}
                      {row.platform > 0 && row.byok > 0 && (
                        <div className="h-full w-[2px] shrink-0 bg-card" />
                      )}
                      {row.byok > 0 && (
                        <div
                          className={`h-full ${colorClass}`}
                          style={{ flexGrow: row.byok, ...BYOK_HATCH_STYLE }}
                        />
                      )}
                    </div>
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
