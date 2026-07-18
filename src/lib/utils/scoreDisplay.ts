/**
 * Shared score display helpers for consistent styling across
 * teacher submission view and student completion panel.
 */

export function getScoreColor(percentage: number): string {
  if (percentage >= 90) return "text-green-600 dark:text-green-400";
  if (percentage >= 75) return "text-blue-600 dark:text-blue-400";
  if (percentage >= 60) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

export function getScoreBgColor(percentage: number): string {
  if (percentage >= 90) return "bg-green-100 dark:bg-green-900/30";
  if (percentage >= 75) return "bg-blue-100 dark:bg-blue-900/30";
  if (percentage >= 60) return "bg-yellow-100 dark:bg-yellow-900/30";
  return "bg-red-100 dark:bg-red-900/30";
}

export function getRubricItemScoreColor(percentage: number): string {
  if (percentage >= 75) return "text-green-600 dark:text-green-400";
  if (percentage >= 50) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

/**
 * Snap a points value to the nearest 0.05 increment (the LLM emits
 * arbitrary-precision floats like 6.6666667). Rounding through integers first,
 * then dividing, avoids binary-float artifacts (e.g. 0.15000000000000002).
 */
export function roundScore(value: number): number {
  return Math.round(value * 20) / 20;
}

/**
 * Format a points value for display: snapped to the nearest 0.05, with any
 * trailing zeros dropped (7 → "7", 6.5 → "6.5", 6.6666667 → "6.65"). Used at the
 * render sites so legacy rows already stored with long decimals show cleanly too.
 */
export function formatPoints(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "0";
  return String(roundScore(value));
}
