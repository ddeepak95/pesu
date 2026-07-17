import { Fragment } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { modalityColorClass } from "./modalityColors";
import type { UsageBreakdownRow } from "@/lib/queries/aiUsage";

interface ModalityRow {
  dimension: string;
  platform: number;
  institution: number;
  class: number;
  total: number;
}

/**
 * BYOK segments are the same modality hue as Platform, textured rather than a
 * second hue or a plain opacity fade, so they survive CVD, grayscale, and
 * print the same way Platform's solid fill does. The two BYOK owners get
 * opposite diagonals: institution key = 45°, class key = 135° — direction
 * (not density) distinguishes them, which stays legible at bar heights.
 */
const INSTITUTION_KEY_HATCH_STYLE = {
  backgroundImage:
    "repeating-linear-gradient(45deg, rgba(0,0,0,0.45) 0px, rgba(0,0,0,0.45) 2px, transparent 2px, transparent 5px)",
};

const CLASS_KEY_HATCH_STYLE = {
  backgroundImage:
    "repeating-linear-gradient(135deg, rgba(0,0,0,0.45) 0px, rgba(0,0,0,0.45) 2px, transparent 2px, transparent 5px)",
};

/**
 * Legend-only variants: stripes drawn in `currentColor` rather than a fixed
 * rgba, so they track the swatch's own ink color (set via `text-foreground`)
 * and stay visible against a transparent box on any surface — unlike the
 * bar's hatch, which always sits on a solid modality fill and never needs to
 * contrast against the page underneath it.
 */
const INSTITUTION_KEY_LEGEND_HATCH_STYLE = {
  backgroundImage:
    "repeating-linear-gradient(45deg, currentColor 0px, currentColor 2px, transparent 2px, transparent 5px)",
};

const CLASS_KEY_LEGEND_HATCH_STYLE = {
  backgroundImage:
    "repeating-linear-gradient(135deg, currentColor 0px, currentColor 2px, transparent 2px, transparent 5px)",
};

interface ModalityBreakdownCardProps {
  title: string;
  /** "AI Credits" | "Requests" */
  unitLabel: string;
  rows: UsageBreakdownRow[];
  valueKey: "credits" | "calls";
  formatValue?: (value: number) => string;
  /**
   * Class analytics view — split by how the class experiences the key rather
   * than by owner: platform-credit and institution-BYOK usage merge into one
   * "Institution Default" segment (mirroring the providers dropdown, where
   * both are the same "Institution Default" choice), leaving "Class Key" as
   * the only hatched segment.
   */
  classScope?: boolean;
}

interface SegmentLabels {
  platform: string;
  institution: string;
  class: string;
}

const OWNER_LABELS: SegmentLabels = {
  platform: "Platform",
  institution: "Institution key",
  class: "Class key",
};

const CLASS_SCOPE_LABELS: SegmentLabels = {
  platform: "Institution Default",
  institution: "Institution key", // unreachable at class scope (folded into platform)
  class: "Class Key",
};

function splitLabel(
  platform: number,
  institution: number,
  cls: number,
  formatValue: (v: number) => string,
  labels: SegmentLabels,
): string {
  const parts = [`${formatValue(platform)} ${labels.platform}`];
  if (institution > 0) parts.push(`${formatValue(institution)} ${labels.institution}`);
  if (cls > 0) parts.push(`${formatValue(cls)} ${labels.class}`);
  return parts.join(" · ");
}

/**
 * "By AI Credits" / "By API Requests" card — a hero total (split by whose key
 * served the calls) plus a per-modality horizontal bar comparison. Bar length
 * is proportional to the row's share of this card's own max value (credits
 * and calls are different scales, so each card scales independently) — the
 * point is comparing modalities against each other at a glance, not reading
 * an absolute axis. Each bar is stacked into a platform segment (solid
 * modality hue) and BYOK segments (same hue, hatched: institution key 45°,
 * class key 135°) so key ownership reads within the modality color rather
 * than spending extra hues on it — a shared legend names the segments once
 * for the whole card. At `classScope`, institution-BYOK usage folds into the
 * solid segment as "Institution Default" (see the prop doc).
 */
export default function ModalityBreakdownCard({
  title,
  unitLabel,
  rows,
  valueKey,
  formatValue = (v) => v.toLocaleString(undefined, { maximumFractionDigits: 2 }),
  classScope = false,
}: ModalityBreakdownCardProps) {
  const labels = classScope ? CLASS_SCOPE_LABELS : OWNER_LABELS;
  const byModality = new Map<string, { platform: number; institution: number; class: number }>();
  for (const row of rows) {
    const entry = byModality.get(row.dimension) ?? { platform: 0, institution: 0, class: 0 };
    const sourceKey =
      classScope && row.keySource === "institution" ? "platform" : row.keySource;
    entry[sourceKey] += row[valueKey];
    byModality.set(row.dimension, entry);
  }
  const modalityRows: ModalityRow[] = Array.from(byModality.entries())
    .map(([dimension, split]) => ({
      dimension,
      ...split,
      total: split.platform + split.institution + split.class,
    }))
    .sort((a, b) => b.total - a.total);
  const totalPlatform = modalityRows.reduce((sum, r) => sum + r.platform, 0);
  const totalInstitutionKey = modalityRows.reduce((sum, r) => sum + r.institution, 0);
  const totalClassKey = modalityRows.reduce((sum, r) => sum + r.class, 0);
  const total = totalPlatform + totalInstitutionKey + totalClassKey;
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
              {splitLabel(totalPlatform, totalInstitutionKey, totalClassKey, formatValue, labels)}
            </p>
          </div>
        </div>
        {modalityRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 rounded-sm border border-foreground/50 bg-current text-foreground" />
              {labels.platform}
            </span>
            {!classScope && (
              <span className="flex items-center gap-1.5">
                <span
                  className="h-3.5 w-3.5 rounded-sm border border-foreground/50 bg-transparent text-foreground"
                  style={INSTITUTION_KEY_LEGEND_HATCH_STYLE}
                />
                {labels.institution}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span
                className="h-3.5 w-3.5 rounded-sm border border-foreground/50 bg-transparent text-foreground"
                style={CLASS_KEY_LEGEND_HATCH_STYLE}
              />
              {labels.class}
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
              const segments = [
                { value: row.platform, style: undefined },
                { value: row.institution, style: INSTITUTION_KEY_HATCH_STYLE },
                { value: row.class, style: CLASS_KEY_HATCH_STYLE },
              ].filter((s) => s.value > 0);
              return (
                <li key={row.dimension} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-foreground">{row.dimension}</span>
                    <span
                      className="text-muted-foreground tabular-nums"
                      title={splitLabel(row.platform, row.institution, row.class, formatValue, labels)}
                    >
                      {formatValue(row.total)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="flex h-full"
                      style={{ width: `${widthPercent}%` }}
                    >
                      {segments.map((segment, index) => (
                        <Fragment key={index}>
                          {index > 0 && (
                            <div className="h-full w-[2px] shrink-0 bg-card" />
                          )}
                          <div
                            className={`h-full ${colorClass}`}
                            style={{ flexGrow: segment.value, ...segment.style }}
                          />
                        </Fragment>
                      ))}
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
