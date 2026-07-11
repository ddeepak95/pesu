import type { AppLogRow } from "@/lib/queries/appLogs";

const LEVEL_STYLES: Record<AppLogRow["level"], string> = {
  error: "bg-destructive/10 text-destructive border-destructive/40",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
};

/**
 * Presentational admin-facing table over app_logs rows. Used by both the
 * platform (super-admin) and institution-admin log pages. Rows are already
 * RLS-scoped by the caller's query.
 */
export default function AppLogsTable({ logs }: { logs: AppLogRow[] }) {
  if (logs.length === 0) {
    return (
      <div className="rounded border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
        No log entries match these filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">When</th>
            <th className="px-3 py-2 font-medium">Level</th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2 font-medium">Event</th>
            <th className="px-3 py-2 font-medium">Code</th>
            <th className="px-3 py-2 font-medium">Message</th>
            <th className="px-3 py-2 font-medium">Scope</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-t align-top">
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                {new Date(log.created_at).toLocaleString()}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${LEVEL_STYLES[log.level]}`}
                >
                  {log.level}
                </span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                {log.source}
              </td>
              <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                {log.event}
              </td>
              <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                {log.error_code ?? "—"}
              </td>
              <td className="px-3 py-2 max-w-md text-muted-foreground">
                {log.message ?? "—"}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                {[
                  log.activity_id && `activity:${log.activity_id}`,
                  log.submission_id && `sub:${log.submission_id}`,
                  log.question_order != null && `q:${log.question_order}`,
                ]
                  .filter(Boolean)
                  .join(" ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
