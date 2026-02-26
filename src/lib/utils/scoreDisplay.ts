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
