"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getClassContentCompletions } from "@/lib/queries/contentCompletions";
import {
  StudentContentCompletionWithDetails,
  ContentItemType,
} from "@/types/contentCompletion";
import { CheckCircle2, XCircle, Columns3 } from "lucide-react";
import { getClassGroups, ClassGroup } from "@/lib/queries/groups";

interface StudentProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classDbId: string;
}

type CompletionFilter = "all" | "complete" | "incomplete";

interface ContentColumn {
  contentItemId: string;
  contentName: string;
  contentType: ContentItemType;
  contentGroupId: string | null;
}

interface StudentRow {
  studentId: string;
  studentName: string;
  studentEmail: string | null;
  studentGroupId: string | null;
  completions: Map<string, { isComplete: boolean; completedAt: string | null }>;
}

const CONTENT_TYPE_LABELS: Record<ContentItemType, string> = {
  learning_content: "Content",
  quiz: "Quiz",
  formative_assignment: "Activity",
  survey: "Survey",
};

export default function StudentProgressDialog({
  open,
  onOpenChange,
  classDbId,
}: StudentProgressDialogProps) {
  const [data, setData] = useState<StudentContentCompletionWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [completionFilter, setCompletionFilter] =
    useState<CompletionFilter>("all");
  const [contentTypeFilter, setContentTypeFilter] = useState<
    ContentItemType | "all"
  >("all");
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(
    new Set()
  );

  // Fetch data when dialog opens
  useEffect(() => {
    if (!open) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [completions, classGroups] = await Promise.all([
          getClassContentCompletions(classDbId),
          getClassGroups(classDbId),
        ]);
        setData(completions);
        setGroups(classGroups);
        // Default to first group
        if (classGroups.length > 0) {
          setSelectedGroupId(classGroups[0].id);
        }
        // Initialize all columns as selected
        const allColumnIds = new Set<string>();
        completions.forEach((item) => allColumnIds.add(item.contentItemId));
        setSelectedColumns(allColumnIds);
      } catch (err) {
        console.error("Error fetching progress data:", err);
        setError("Failed to load student progress data.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [open, classDbId]);

  // Reset filters when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSearchQuery("");
      setCompletionFilter("all");
      setContentTypeFilter("all");
      setSelectedColumns(new Set());
      setSelectedGroupId(null);
      setGroups([]);
    }
    onOpenChange(newOpen);
  };

  // Get all unique content columns (filtered by selected group)
  const allContentColumns = useMemo(() => {
    const columnsMap = new Map<string, ContentColumn>();

    data.forEach((item) => {
      // Filter by selected group
      if (selectedGroupId && item.contentGroupId !== selectedGroupId) {
        return;
      }
      if (!columnsMap.has(item.contentItemId)) {
        columnsMap.set(item.contentItemId, {
          contentItemId: item.contentItemId,
          contentName: item.contentName,
          contentType: item.contentType,
          contentGroupId: item.contentGroupId,
        });
      }
    });

    return Array.from(columnsMap.values());
  }, [data, selectedGroupId]);

  // Filter columns by type and selection
  const contentColumns = useMemo(() => {
    return allContentColumns.filter((col) => {
      // Filter by type
      if (
        contentTypeFilter !== "all" &&
        col.contentType !== contentTypeFilter
      ) {
        return false;
      }
      // Filter by column selection
      if (!selectedColumns.has(col.contentItemId)) {
        return false;
      }
      return true;
    });
  }, [allContentColumns, contentTypeFilter, selectedColumns]);

  // Toggle column selection
  const toggleColumn = (columnId: string) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
  };

  // Select/deselect all columns (respecting type filter)
  const selectAllColumns = () => {
    const columnsToSelect = allContentColumns
      .filter(
        (col) =>
          contentTypeFilter === "all" || col.contentType === contentTypeFilter
      )
      .map((col) => col.contentItemId);
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      columnsToSelect.forEach((id) => next.add(id));
      return next;
    });
  };

  const deselectAllColumns = () => {
    const columnsToDeselect = allContentColumns
      .filter(
        (col) =>
          contentTypeFilter === "all" || col.contentType === contentTypeFilter
      )
      .map((col) => col.contentItemId);
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      columnsToDeselect.forEach((id) => next.delete(id));
      return next;
    });
  };

  // Check if all visible columns are selected
  const allVisibleSelected = useMemo(() => {
    const visibleColumns = allContentColumns.filter(
      (col) =>
        contentTypeFilter === "all" || col.contentType === contentTypeFilter
    );
    return visibleColumns.every((col) =>
      selectedColumns.has(col.contentItemId)
    );
  }, [allContentColumns, contentTypeFilter, selectedColumns]);

  // Transform flat data into student rows with completion map (filtered by selected group)
  const studentRows = useMemo(() => {
    const rowsMap = new Map<string, StudentRow>();

    data.forEach((item) => {
      // Filter students by selected group
      if (selectedGroupId && item.studentGroupId !== selectedGroupId) {
        return;
      }
      if (!rowsMap.has(item.studentId)) {
        rowsMap.set(item.studentId, {
          studentId: item.studentId,
          studentName: item.studentName,
          studentEmail: item.studentEmail,
          studentGroupId: item.studentGroupId,
          completions: new Map(),
        });
      }

      const row = rowsMap.get(item.studentId)!;
      row.completions.set(item.contentItemId, {
        isComplete: item.isComplete,
        completedAt: item.completedAt,
      });
    });

    return Array.from(rowsMap.values());
  }, [data, selectedGroupId]);

  // Apply filters to student rows
  const filteredRows = useMemo(() => {
    return studentRows.filter((row) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = row.studentName.toLowerCase().includes(query);
        const matchesEmail =
          row.studentEmail?.toLowerCase().includes(query) || false;
        if (!matchesName && !matchesEmail) {
          return false;
        }
      }

      // Completion filter - check against visible columns only
      if (completionFilter !== "all" && contentColumns.length > 0) {
        const visibleCompletions = contentColumns.map(
          (col) => row.completions.get(col.contentItemId)?.isComplete ?? false
        );

        if (completionFilter === "complete") {
          // Show only students who completed ALL visible content
          if (!visibleCompletions.every((c) => c)) {
            return false;
          }
        } else if (completionFilter === "incomplete") {
          // Show only students who have at least one incomplete visible content
          if (visibleCompletions.every((c) => c)) {
            return false;
          }
        }
      }

      return true;
    });
  }, [studentRows, searchQuery, completionFilter, contentColumns]);

  // Calculate completion stats
  const stats = useMemo(() => {
    if (contentColumns.length === 0 || filteredRows.length === 0) {
      return null;
    }

    let totalComplete = 0;
    let totalCells = 0;

    filteredRows.forEach((row) => {
      contentColumns.forEach((col) => {
        totalCells++;
        if (row.completions.get(col.contentItemId)?.isComplete) {
          totalComplete++;
        }
      });
    });

    return {
      totalComplete,
      totalCells,
      percentage: Math.round((totalComplete / totalCells) * 100),
    };
  }, [filteredRows, contentColumns]);

  // Get columns available for selection (filtered by type)
  const selectableColumns = useMemo(() => {
    return allContentColumns.filter(
      (col) =>
        contentTypeFilter === "all" || col.contentType === contentTypeFilter
    );
  }, [allContentColumns, contentTypeFilter]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Student Progress</DialogTitle>
          <DialogDescription>
            View content completion status for all students in this class.
          </DialogDescription>
        </DialogHeader>

        {/* Group Tabs */}
        {groups.length > 0 && (
          <div className="flex gap-1 border-b overflow-x-auto pb-0">
            {groups.map((group) => (
              <button
                key={group.id}
                onClick={() => setSelectedGroupId(group.id)}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  selectedGroupId === group.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
                }`}
              >
                {group.name || `Group ${group.group_index + 1}`}
              </button>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 py-4 border-b">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search by student name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Select
            value={completionFilter}
            onValueChange={(value) =>
              setCompletionFilter(value as CompletionFilter)
            }
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Students</SelectItem>
              <SelectItem value="complete">All Complete</SelectItem>
              <SelectItem value="incomplete">Has Incomplete</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={contentTypeFilter}
            onValueChange={(value) =>
              setContentTypeFilter(value as ContentItemType | "all")
            }
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Content Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="learning_content">Content</SelectItem>
              <SelectItem value="quiz">Quiz</SelectItem>
              <SelectItem value="formative_assignment">Activity</SelectItem>
              <SelectItem value="survey">Survey</SelectItem>
            </SelectContent>
          </Select>

          {/* Column Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Columns3 className="h-4 w-4" />
                Columns ({contentColumns.length}/{selectableColumns.length})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-[250px] max-h-[300px] overflow-y-auto"
            >
              <DropdownMenuLabel>Select Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={allVisibleSelected}
                onCheckedChange={(checked) => {
                  if (checked) {
                    selectAllColumns();
                  } else {
                    deselectAllColumns();
                  }
                }}
              >
                <span className="font-medium">Select All</span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {selectableColumns.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.contentItemId}
                  checked={selectedColumns.has(col.contentItemId)}
                  onCheckedChange={() => toggleColumn(col.contentItemId)}
                >
                  <div className="flex flex-col">
                    <span className="truncate max-w-[200px]">
                      {col.contentName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {CONTENT_TYPE_LABELS[col.contentType]}
                    </span>
                  </div>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Loading progress data...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-destructive">{error}</p>
            </div>
          ) : allContentColumns.length === 0 || studentRows.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No content items or students found.
              </p>
            </div>
          ) : contentColumns.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No columns selected. Use the &quot;Columns&quot; button to
                select content to display.
              </p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No students match your filters.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-sm sticky left-0 bg-muted/50 min-w-[180px]">
                      Student
                    </th>
                    {contentColumns.map((col) => (
                      <th
                        key={col.contentItemId}
                        className="text-left p-3 font-medium text-sm min-w-[120px]"
                      >
                        <div
                          className="truncate max-w-[150px]"
                          title={col.contentName}
                        >
                          {col.contentName}
                        </div>
                        <div className="text-xs font-normal text-muted-foreground">
                          {CONTENT_TYPE_LABELS[col.contentType]}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => (
                    <tr
                      key={row.studentId}
                      className={
                        index < filteredRows.length - 1 ? "border-b" : ""
                      }
                    >
                      <td className="p-3 sticky left-0 bg-background">
                        <div className="text-sm font-medium">
                          {row.studentName}
                        </div>
                        {row.studentEmail &&
                          row.studentEmail !== row.studentName && (
                            <div className="text-xs text-muted-foreground">
                              {row.studentEmail}
                            </div>
                          )}
                      </td>
                      {contentColumns.map((col) => {
                        const completion = row.completions.get(
                          col.contentItemId
                        );
                        const isComplete = completion?.isComplete ?? false;

                        return (
                          <td
                            key={col.contentItemId}
                            className="p-3"
                            title={
                              isComplete && completion?.completedAt
                                ? `Completed: ${new Date(
                                    completion.completedAt
                                  ).toLocaleDateString()}`
                                : "Not completed"
                            }
                          >
                            {isComplete ? (
                              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                            ) : (
                              <XCircle className="h-6 w-6 text-gray-300 dark:text-gray-600" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary */}
        {!loading && !error && stats && (
          <div className="pt-4 border-t text-sm text-muted-foreground flex justify-between">
            <span>
              {filteredRows.length} student
              {filteredRows.length !== 1 ? "s" : ""} • {contentColumns.length}{" "}
              content item{contentColumns.length !== 1 ? "s" : ""}
            </span>
            <span>
              Overall completion: {stats.totalComplete}/{stats.totalCells} (
              {stats.percentage}%)
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
