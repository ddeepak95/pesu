const LEVELS = ["error", "warn", "info"] as const;
const SOURCES = [
  "multimodal_turn",
  "multimodal_action",
  "action_retry",
  "evaluate",
] as const;

/**
 * Plain GET form for narrowing the log table. Server-component friendly — it
 * submits `level`/`source` as query params the page reads from searchParams.
 */
export default function AppLogsFilterBar({
  action,
  level,
  source,
}: {
  action: string;
  level?: string;
  source?: string;
}) {
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col text-sm">
        <span className="mb-1 text-muted-foreground">Level</span>
        <select
          name="level"
          defaultValue={level ?? ""}
          className="rounded border px-2 py-1.5 text-sm"
        >
          <option value="">All</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-sm">
        <span className="mb-1 text-muted-foreground">Source</span>
        <select
          name="source"
          defaultValue={source ?? ""}
          className="rounded border px-2 py-1.5 text-sm"
        >
          <option value="">All</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Apply
      </button>
    </form>
  );
}
