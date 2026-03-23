"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import StudentStatusDistribution from "../StudentStatusDistribution";
import { StudentsAnalyticsBucket } from "../hooks/useClassStudentsData";

interface AnalyticsSortableRowsProps {
  rows: StudentsAnalyticsBucket[];
  emptyMessage: string;
  sortKey: "label" | "totalStudents";
  sortDirection: "asc" | "desc";
  onSort: (key: "label" | "totalStudents") => void;
}

export default function AnalyticsSortableRows({
  rows,
  emptyMessage,
  sortKey,
  sortDirection,
  onSort,
}: AnalyticsSortableRowsProps) {
  if (rows.length === 0) {
    return (
      <div className="py-6 text-sm text-muted-foreground">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const sortIcon = (key: "label" | "totalStudents") => {
    if (sortKey !== key) return <ArrowUpDown className="h-3.5 w-3.5" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" />
    );
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[minmax(160px,1fr)_120px_minmax(230px,1fr)] gap-3 border-b pb-2 text-xs font-medium text-muted-foreground">
        <button
          type="button"
          onClick={() => onSort("label")}
          className="inline-flex items-center gap-1 text-left hover:text-foreground"
        >
          Bucket
          {sortIcon("label")}
        </button>
        <button
          type="button"
          onClick={() => onSort("totalStudents")}
          className="inline-flex items-center gap-1 text-left hover:text-foreground"
        >
          Total students
          {sortIcon("totalStudents")}
        </button>
        <span>Status distribution</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid grid-cols-[minmax(160px,1fr)_120px_minmax(230px,1fr)] items-center gap-3 py-1.5 text-sm"
        >
          <span className="truncate text-muted-foreground">{row.label}</span>
          <span className="font-medium">{row.totalStudents}</span>
          <StudentStatusDistribution
            completed={row.completed}
            inProgress={row.inProgress}
            notStarted={row.notStarted}
            total={row.totalStudents}
          />
        </div>
      ))}
    </div>
  );
}
