/**
 * Build href for teacher material detail pages when switching primary tabs,
 * preserving other query params (e.g. groupId, studentId).
 */
export function buildTeacherDetailHrefWithTab(
  detailPath: string,
  searchParams: URLSearchParams,
  nextTab: string,
  options: { allowedTabs: readonly string[]; defaultTab: string }
): string {
  const tab = options.allowedTabs.includes(nextTab)
    ? nextTab
    : options.defaultTab;
  const q = new URLSearchParams(searchParams.toString());
  q.set("tab", tab);
  const qs = q.toString();
  return qs ? `${detailPath}?${qs}` : detailPath;
}

export function resolveTeacherDetailTabParam(
  tabParam: string | null,
  options: { allowedTabs: readonly string[]; defaultTab: string }
): string {
  if (tabParam && options.allowedTabs.includes(tabParam)) {
    return tabParam;
  }
  return options.defaultTab;
}
