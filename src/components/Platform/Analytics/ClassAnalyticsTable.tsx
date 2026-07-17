import type {
  ClassAnalyticsRow,
  CountPair,
} from "@/lib/queries/institutionAnalytics";

/**
 * Presentational per-class engagement table. Purely display — the caller owns
 * fetching/loading state. Each numeric cell shows the all-time total with a
 * muted "+N" delta for the recent (last-7-days) window.
 */
export default function ClassAnalyticsTable({
  rows,
}: {
  rows: ClassAnalyticsRow[];
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
        No active classes in this institution yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Class</th>
            <th className="px-3 py-2 font-medium text-right">Activities</th>
            <th className="px-3 py-2 font-medium text-right">Students</th>
            <th className="px-3 py-2 font-medium text-right">Completed</th>
            <th className="px-3 py-2 font-medium text-right">In progress</th>
            <th className="px-3 py-2 font-medium text-right">Turns</th>
            <th className="px-3 py-2 font-medium text-right">Avg turns/convo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.classDbId} className="border-t">
              <td className="px-3 py-2">{row.className}</td>
              <PairCell pair={row.activities} />
              <PairCell pair={row.students} />
              <PairCell pair={row.conversationsCompleted} />
              <PairCell pair={row.conversationsOpen} />
              <PairCell pair={row.turns} />
              <td className="px-3 py-2 text-right tabular-nums">
                {row.conversationsTotal > 0
                  ? row.avgTurnsPerConversation.toFixed(1)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A right-aligned count cell: all-time total + muted last-week delta. */
function PairCell({ pair }: { pair: CountPair }) {
  return (
    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
      {pair.total.toLocaleString()}
      {pair.recent > 0 && (
        <span className="ml-1.5 text-xs text-muted-foreground">
          +{pair.recent.toLocaleString()}
        </span>
      )}
    </td>
  );
}
