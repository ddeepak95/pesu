export interface UsageMonthOption {
  /** First-of-month UTC date, `YYYY-MM-DD` — matches `ai_usage_counters.period_start`. */
  value: string;
  /** "July 2027" */
  label: string;
}

const MONTH_LABEL_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Current calendar month, first-of-month UTC date — matches aiUsage.ts's currentMonthStart(). */
export function currentUsageMonthValue(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

/** The current month plus the `count - 1` months before it, most recent first — for a month picker. */
export function listRecentUsageMonths(count = 12): UsageMonthOption[] {
  const now = new Date();
  const months: UsageMonthOption[] = [];
  for (let i = 0; i < count; i++) {
    const monthDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    months.push({
      value: monthDate.toISOString().slice(0, 10),
      label: MONTH_LABEL_FORMAT.format(monthDate),
    });
  }
  return months;
}
