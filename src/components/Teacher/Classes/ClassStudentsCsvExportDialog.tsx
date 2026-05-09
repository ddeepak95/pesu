"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export interface ClassStudentsCsvExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  columns: { id: string; label: string }[];
  onDownload: (selectedIds: Set<string>) => void;
}

type FormProps = {
  columnIds: string[];
  title: string;
  description: string;
  columns: ClassStudentsCsvExportDialogProps["columns"];
  onDownload: ClassStudentsCsvExportDialogProps["onDownload"];
  onOpenChange: ClassStudentsCsvExportDialogProps["onOpenChange"];
};

function ClassStudentsCsvExportForm({
  columnIds,
  title,
  description,
  columns,
  onDownload,
  onOpenChange,
}: FormProps) {
  const [selected, setSelected] = useState(() => new Set(columnIds));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(columnIds));
  const clearAll = () => setSelected(new Set());

  const handleDownload = () => {
    if (selected.size === 0) return;
    onDownload(selected);
    onOpenChange(false);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <div className="flex gap-2 py-1">
        <Button type="button" variant="outline" size="sm" onClick={selectAll}>
          Select all
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={clearAll}>
          Clear all
        </Button>
      </div>

      <div className="max-h-[min(320px,50vh)] overflow-y-auto rounded-md border p-3 space-y-3">
        {columns.map((col, index) => {
          const fieldId = `csv-export-col-${index}`;
          return (
            <div key={col.id} className="flex items-start gap-3">
              <Checkbox
                id={fieldId}
                checked={selected.has(col.id)}
                onCheckedChange={() => toggle(col.id)}
              />
              <Label
                htmlFor={fieldId}
                className="text-sm font-normal leading-tight cursor-pointer pt-0.5"
              >
                {col.label}
              </Label>
            </div>
          );
        })}
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="button" onClick={handleDownload} disabled={selected.size === 0}>
          Download
        </Button>
      </DialogFooter>
    </>
  );
}

export default function ClassStudentsCsvExportDialog({
  open,
  onOpenChange,
  title,
  description = "Choose which columns to include in the CSV file.",
  columns,
  onDownload,
}: ClassStudentsCsvExportDialogProps) {
  const columnIds = useMemo(() => columns.map((c) => c.id), [columns]);
  const columnsKey = columnIds.join("|");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <ClassStudentsCsvExportForm
            key={columnsKey}
            columnIds={columnIds}
            title={title}
            description={description}
            columns={columns}
            onDownload={onDownload}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
