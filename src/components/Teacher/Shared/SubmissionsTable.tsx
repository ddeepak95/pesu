"use client";

import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Lock,
  Unlock,
  Search,
  Filter,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfileField } from "@/types/profileFields";
import UnlockConfirmDialog from "./UnlockConfirmDialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubmissionsTableColumn {
  key: string;
  label: string;
  /** Render cell content. Receives the row data. */
  render: (row: SubmissionsTableRow) => React.ReactNode;
  /** Whether the column is sortable. Default: true */
  sortable?: boolean;
  /** Custom sort value extractor. Returns a string or number for comparison. */
  sortValue?: (row: SubmissionsTableRow) => string | number;
  /** Alignment */
  align?: "left" | "right" | "center";
}

export interface SubmissionsTableRow {
  /** Unique key for the row (student_id or submission_id) */
  id: string;
  /** Student display name */
  name: string;
  /** Student email (for search) */
  email?: string | null;
  /** Status for filtering */
  status?: string;
  /** Profile data keyed by profile field ID */
  profileData?: Record<string, string>;
  /** Whether the teacher has unlocked this content for the student */
  isUnlocked?: boolean;
  /** Arbitrary data for custom column renderers */
  data?: Record<string, unknown>;
}

export type SortDirection = "asc" | "desc";

export interface SortState {
  column: string;
  direction: SortDirection;
}

export interface StatusFilterOption {
  value: string;
  label: string;
}

interface SubmissionsTableProps {
  columns: SubmissionsTableColumn[];
  rows: SubmissionsTableRow[];
  /** Status filter options (e.g., completed, started, not_started). Pass empty array to hide. */
  statusFilterOptions?: StatusFilterOption[];
  /** Profile fields to display under student name */
  profileFields?: ProfileField[];
  /** IDs of profile fields to display */
  displayFieldIds?: Set<string>;
  /** IDs of profile fields to show as filter dropdowns (dropdown-type only) */
  filterFieldIds?: Set<string>;
  /** Whether to show the unlock column */
  showUnlockColumn?: boolean;
  /** Content name for unlock dialog */
  contentName?: string;
  /** Callback when unlock/lock is toggled */
  onToggleUnlock?: (studentId: string, currentlyUnlocked: boolean) => Promise<void>;
  /** Empty state message */
  emptyMessage?: string;
  /** Search placeholder */
  searchPlaceholder?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SubmissionsTable({
  columns,
  rows,
  statusFilterOptions = [],
  profileFields = [],
  displayFieldIds = new Set(),
  filterFieldIds = new Set(),
  showUnlockColumn = false,
  contentName = "",
  onToggleUnlock,
  emptyMessage = "No data available.",
  searchPlaceholder = "Search by student name...",
}: SubmissionsTableProps) {
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState<SortState>({
    column: "__name",
    direction: "asc",
  });

  // Unlock dialog state
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<{
    studentId: string;
    studentName: string;
    isCurrentlyUnlocked: boolean;
  } | null>(null);

  // Profile filter state
  const [profileFilters, setProfileFilters] = useState<
    Record<string, Set<string>>
  >({});

  // Filterable dropdown fields
  const filterableFields = useMemo(() => {
    if (filterFieldIds.size === 0) return [];
    return profileFields.filter(
      (f) => filterFieldIds.has(f.id) && f.options && f.options.length > 0
    );
  }, [profileFields, filterFieldIds]);

  // Toggle a profile filter option value
  const toggleProfileFilterValue = useCallback(
    (fieldId: string, value: string) => {
      setProfileFilters((prev) => {
        const currentSet = prev[fieldId] ?? new Set<string>();
        const next = new Set(currentSet);
        if (next.has(value)) {
          next.delete(value);
        } else {
          next.add(value);
        }
        return { ...prev, [fieldId]: next };
      });
    },
    []
  );

  // Profile fields to show
  const visibleProfileFields = useMemo(() => {
    if (displayFieldIds.size === 0) return [];
    return profileFields.filter((f) => displayFieldIds.has(f.id));
  }, [profileFields, displayFieldIds]);

  // Filter rows
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = row.name.toLowerCase().includes(q);
        const matchesEmail = row.email?.toLowerCase().includes(q) || false;
        if (!matchesName && !matchesEmail) return false;
      }
      // Status filter
      if (statusFilter !== "all" && row.status !== statusFilter) {
        return false;
      }
      // Profile field filters: AND across fields, OR within a field's selected values
      for (const [fieldId, selectedValues] of Object.entries(profileFilters)) {
        if (selectedValues.size === 0) continue;
        const studentValue = row.profileData?.[fieldId] ?? "";
        if (!selectedValues.has(studentValue)) {
          return false;
        }
      }
      return true;
    });
  }, [rows, searchQuery, statusFilter, profileFilters]);

  // Sort rows
  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows];
    sorted.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      if (sort.column === "__name") {
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
      } else if (sort.column === "__unlock") {
        aVal = a.isUnlocked ? 1 : 0;
        bVal = b.isUnlocked ? 1 : 0;
      } else {
        // Custom column sort
        const col = columns.find((c) => c.key === sort.column);
        if (col?.sortValue) {
          aVal = col.sortValue(a);
          bVal = col.sortValue(b);
        } else {
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
        }
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sort.direction === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sort.direction === "asc" ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
    return sorted;
  }, [filteredRows, sort, columns]);

  // Sort handler
  const handleSort = useCallback(
    (columnKey: string) => {
      setSort((prev) => {
        if (prev.column === columnKey) {
          return {
            column: columnKey,
            direction: prev.direction === "asc" ? "desc" : "asc",
          };
        }
        return { column: columnKey, direction: "asc" };
      });
    },
    []
  );

  // Unlock handler
  const handleUnlockClick = useCallback(
    (row: SubmissionsTableRow) => {
      setUnlockTarget({
        studentId: row.id,
        studentName: row.name,
        isCurrentlyUnlocked: row.isUnlocked ?? false,
      });
      setUnlockDialogOpen(true);
    },
    []
  );

  const handleUnlockConfirm = useCallback(async () => {
    if (!unlockTarget || !onToggleUnlock) return;
    await onToggleUnlock(unlockTarget.studentId, unlockTarget.isCurrentlyUnlocked);
  }, [unlockTarget, onToggleUnlock]);

  // Render sort icon
  const SortIcon = ({
    columnKey,
    className,
  }: {
    columnKey: string;
    className?: string;
  }) => {
    if (sort.column !== columnKey) {
      return <ArrowUpDown className={`h-3 w-3 text-muted-foreground/50 ${className || ""}`} />;
    }
    return sort.direction === "asc" ? (
      <ArrowUp className={`h-3 w-3 ${className || ""}`} />
    ) : (
      <ArrowDown className={`h-3 w-3 ${className || ""}`} />
    );
  };

  if (rows.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: search + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {statusFilterOptions.length > 0 && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {statusFilterOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Dynamic profile filter dropdowns */}
        {filterableFields.map((field) => {
          const activeCount = profileFilters[field.id]?.size ?? 0;
          return (
            <DropdownMenu key={`profile-filter-${field.id}`}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className={`gap-2 ${activeCount > 0 ? "border-primary" : ""}`}
                >
                  <Filter className="h-4 w-4" />
                  {field.field_name}
                  {activeCount > 0 && (
                    <span className="ml-1 rounded-full bg-primary text-primary-foreground text-xs px-1.5 py-0.5">
                      {activeCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-[220px] max-h-[300px] overflow-y-auto"
              >
                <DropdownMenuLabel>{field.field_name}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {field.options!.map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option}
                    checked={profileFilters[field.id]?.has(option) ?? false}
                    onCheckedChange={() =>
                      toggleProfileFilterValue(field.id, option)
                    }
                  >
                    {option}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}

        <div className="text-sm text-muted-foreground ml-auto">
          {sortedRows.length} of {rows.length} student
          {rows.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Table */}
      {sortedRows.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No students match your search or filters.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                {/* Name column (always first) */}
                <th className="text-left p-4 font-medium text-sm">
                  <button
                    className="flex items-center gap-1 hover:text-foreground"
                    onClick={() => handleSort("__name")}
                  >
                    Name
                    <SortIcon columnKey="__name" />
                  </button>
                </th>

                {/* Unlock column (optional) */}
                {showUnlockColumn && (
                  <th className="text-left p-4 font-medium text-sm">
                    <button
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() => handleSort("__unlock")}
                    >
                      Access
                      <SortIcon columnKey="__unlock" />
                    </button>
                  </th>
                )}

                {/* Custom columns */}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`p-4 font-medium text-sm ${
                      col.align === "right"
                        ? "text-right"
                        : col.align === "center"
                        ? "text-center"
                        : "text-left"
                    }`}
                  >
                    {col.sortable !== false ? (
                      <button
                        className="flex items-center gap-1 hover:text-foreground"
                        onClick={() => handleSort(col.key)}
                      >
                        {col.label}
                        <SortIcon columnKey={col.key} />
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.id} className="border-b hover:bg-muted/30">
                  {/* Name cell */}
                  <td className="p-4">
                    <div className="text-sm font-medium truncate max-w-[200px]">
                      {row.name}
                    </div>
                    {row.email && row.email !== row.name && (
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {row.email}
                      </div>
                    )}
                    {visibleProfileFields.length > 0 && row.profileData && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {visibleProfileFields.map((field) => {
                          const value = row.profileData?.[field.id];
                          if (!value) return null;
                          return (
                            <span
                              key={field.id}
                              className="text-xs text-muted-foreground"
                            >
                              {value}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </td>

                  {/* Unlock cell */}
                  {showUnlockColumn && (
                    <td className="p-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`gap-1.5 ${
                          row.isUnlocked
                            ? "text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={() => handleUnlockClick(row)}
                      >
                        {row.isUnlocked ? (
                          <>
                            <Unlock className="h-4 w-4" />
                            <span className="text-xs">Unlocked</span>
                          </>
                        ) : (
                          <>
                            <Lock className="h-4 w-4" />
                            <span className="text-xs">Locked</span>
                          </>
                        )}
                      </Button>
                    </td>
                  )}

                  {/* Custom cells */}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`p-4 ${
                        col.align === "right"
                          ? "text-right"
                          : col.align === "center"
                          ? "text-center"
                          : ""
                      }`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Unlock confirm dialog */}
      {unlockTarget && (
        <UnlockConfirmDialog
          open={unlockDialogOpen}
          onOpenChange={setUnlockDialogOpen}
          studentName={unlockTarget.studentName}
          contentName={contentName}
          isCurrentlyUnlocked={unlockTarget.isCurrentlyUnlocked}
          onConfirm={handleUnlockConfirm}
        />
      )}
    </div>
  );
}
