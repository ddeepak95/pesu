const DISABLED = /^(false|0|no)$/i;

/**
 * When false, skip persisting periodic time to `activity_logs` (client + API).
 * Does not affect `activity_events` / `logEvent`.
 *
 * Set `NEXT_PUBLIC_ENABLE_ACTIVITY_LOGS=false` (or `0` / `no`) to disable.
 * Unset or any other value keeps persistence enabled.
 */
export function isActivityLogsPersistenceEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_ENABLE_ACTIVITY_LOGS;
  if (raw === undefined || raw.trim() === "") return true;
  return !DISABLED.test(raw.trim());
}
