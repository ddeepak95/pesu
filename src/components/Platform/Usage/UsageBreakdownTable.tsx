export interface UsageBreakdownRow {
  dimension: string;
  credits: number;
  calls: number;
  keyOwner: "platform" | "byok";
}

/**
 * Presentational usage table — mirrors AppLogsTable.tsx's plain-<table>
 * pattern. One shared shape backs every break-down dimension (modality,
 * model, class, teacher, day); the caller picks which rows to pass in.
 */
export default function UsageBreakdownTable({
  rows,
  dimensionLabel,
}: {
  rows: UsageBreakdownRow[];
  dimensionLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
        No AI usage recorded for this period.
      </div>
    );
  }

  const totalCredits = rows.reduce((sum, r) => sum + r.credits, 0);

  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">{dimensionLabel}</th>
            <th className="px-3 py-2 font-medium">Key</th>
            <th className="px-3 py-2 text-right font-medium">Calls</th>
            <th className="px-3 py-2 text-right font-medium">Credits</th>
            <th className="px-3 py-2 text-right font-medium">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.dimension}-${row.keyOwner}`}
              className="border-t"
            >
              <td className="px-3 py-2">{row.dimension}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {row.keyOwner}
              </td>
              <td className="px-3 py-2 text-right">
                {row.calls.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right font-medium">
                {row.credits.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                {totalCredits > 0
                  ? `${((row.credits / totalCredits) * 100).toFixed(1)}%`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
