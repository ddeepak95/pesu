import type { SubmissionsTableRow } from "@/components/Teacher/Shared/SubmissionsTable";
import type { ProfileField } from "@/types/profileFields";
import { CSV_UTF8_BOM, escapeCsvCell } from "@/lib/csv";

export const CSV_COL_NAME = "name";
export const CSV_COL_EMAIL = "email";
export const CSV_COL_GROUP = "group";
export const CSV_COL_PROGRESS = "progress";
export const CSV_COL_LAST_COMPLETED = "last_completed";
export const CSV_COL_PENDING_APPROVAL = "pending_approval";

export function profileColumnId(fieldId: string): string {
  return `profile:${fieldId}`;
}

export function getInfoCsvColumnOptions(
  visibleProfileFields: ProfileField[]
): { id: string; label: string }[] {
  return [
    { id: CSV_COL_NAME, label: "Name" },
    { id: CSV_COL_EMAIL, label: "Email" },
    ...visibleProfileFields.map((f) => ({
      id: profileColumnId(f.id),
      label: f.field_name,
    })),
    { id: CSV_COL_GROUP, label: "Group" },
  ];
}

export function getProgressCsvColumnOptions(
  visibleProfileFields: ProfileField[]
): { id: string; label: string }[] {
  return [
    ...getInfoCsvColumnOptions(visibleProfileFields),
    { id: CSV_COL_PROGRESS, label: "Progress" },
    { id: CSV_COL_LAST_COMPLETED, label: "Last completed" },
    { id: CSV_COL_PENDING_APPROVAL, label: "Pending approval" },
  ];
}

function formatProgressForCsv(row: SubmissionsTableRow): string {
  const stats = row.data?.progressStats as
    | {
        completed: number;
        total: number;
        lastCompletedAt: string | null;
      }
    | undefined;
  if (!stats || stats.total === 0) return "No content";
  const pct = Math.round((stats.completed / stats.total) * 100);
  return `${stats.completed}/${stats.total} (${pct}%)`;
}

function formatLastCompletedForCsv(row: SubmissionsTableRow): string {
  const stats = row.data?.progressStats as
    | { lastCompletedAt: string | null }
    | undefined;
  if (!stats?.lastCompletedAt) return "";
  return new Date(stats.lastCompletedAt).toISOString().slice(0, 10);
}

function formatPendingApprovalForCsv(row: SubmissionsTableRow): string {
  return row.data?.hasPendingApprovals ? "Yes" : "";
}

function cellValueInfo(
  row: SubmissionsTableRow,
  columnId: string
): string {
  switch (columnId) {
    case CSV_COL_NAME:
      return row.name;
    case CSV_COL_EMAIL:
      return row.email ?? "";
    case CSV_COL_GROUP:
      return String((row.data?.groupDisplayName as string) ?? "");
    default:
      if (columnId.startsWith("profile:")) {
        const fieldId = columnId.slice("profile:".length);
        return (row.profileData?.[fieldId] ?? "").trim();
      }
      return "";
  }
}

function cellValueProgress(
  row: SubmissionsTableRow,
  columnId: string
): string {
  switch (columnId) {
    case CSV_COL_PROGRESS:
      return formatProgressForCsv(row);
    case CSV_COL_LAST_COMPLETED:
      return formatLastCompletedForCsv(row);
    case CSV_COL_PENDING_APPROVAL:
      return formatPendingApprovalForCsv(row);
    default:
      return cellValueInfo(row, columnId);
  }
}

export function buildClassStudentsInfoCsv(
  rows: SubmissionsTableRow[],
  visibleProfileFields: ProfileField[],
  selectedIds: Set<string>
): string {
  const options = getInfoCsvColumnOptions(visibleProfileFields).filter((o) =>
    selectedIds.has(o.id)
  );
  if (options.length === 0) {
    return CSV_UTF8_BOM;
  }
  const lines = [options.map((o) => escapeCsvCell(o.label)).join(",")];
  for (const row of rows) {
    const cells = options.map((o) => cellValueInfo(row, o.id));
    lines.push(cells.map((c) => escapeCsvCell(String(c))).join(","));
  }
  return `${CSV_UTF8_BOM}${lines.join("\r\n")}`;
}

export function buildClassStudentsProgressCsv(
  rows: SubmissionsTableRow[],
  visibleProfileFields: ProfileField[],
  selectedIds: Set<string>
): string {
  const options = getProgressCsvColumnOptions(visibleProfileFields).filter(
    (o) => selectedIds.has(o.id)
  );
  if (options.length === 0) {
    return CSV_UTF8_BOM;
  }
  const lines = [options.map((o) => escapeCsvCell(o.label)).join(",")];
  for (const row of rows) {
    const cells = options.map((o) => cellValueProgress(row, o.id));
    lines.push(cells.map((c) => escapeCsvCell(String(c))).join(","));
  }
  return `${CSV_UTF8_BOM}${lines.join("\r\n")}`;
}
