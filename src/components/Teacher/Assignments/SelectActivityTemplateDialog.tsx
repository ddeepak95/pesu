"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export interface TemplatePickerItem {
  id: string;
  name: string;
  description?: string | null;
  isCurrent: boolean;
}

interface SelectActivityTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: TemplatePickerItem[];
  onSelect: (id: string) => void;
  /** Whether the currently-selected item's row should show the update pill. */
  updateAvailable?: boolean;
  onApplyUpdate?: () => void;
  /** New-tab link for creating a class-owned template when nothing here fits. */
  createHref: string;
}

/**
 * Searchable picker for the assignment's activity template. Modeled on
 * AddFromLibraryDialog's search + bordered-row list, but single-select: click
 * a row to apply it and close, or apply an in-place update to the current row.
 */
export default function SelectActivityTemplateDialog({
  open,
  onOpenChange,
  items,
  onSelect,
  updateAvailable = false,
  onApplyUpdate,
  createHref,
}: SelectActivityTemplateDialogProps) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q),
    );
  }, [items, query]);

  function handleRowClick(item: TemplatePickerItem) {
    if (item.isCurrent) return;
    onSelect(item.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Choose an activity type</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates…"
            className="pl-9"
          />
        </div>

        <div className="max-h-[55vh] space-y-2 overflow-y-auto">
          {items.length === 0 ? (
            <p className="rounded-md border border-dashed bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
              No templates found.
            </p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No templates match &quot;{query}&quot;.
            </p>
          ) : (
            rows.map((item) => (
              <div
                key={item.id}
                onClick={() => handleRowClick(item)}
                className={`flex items-center justify-between gap-3 rounded-md border p-3 ${
                  item.isCurrent
                    ? "border-primary bg-primary/5"
                    : "cursor-pointer hover:bg-muted/50"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {item.isCurrent && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                    <span className="truncate text-sm font-medium">
                      {item.name}
                    </span>
                  </div>
                  {item.description && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                  {item.isCurrent && updateAvailable && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        Update available
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onApplyUpdate?.();
                        }}
                        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        Apply Updates Now
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Can&apos;t find what you need?{" "}
          <a
            href={createHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline underline-offset-2"
          >
            Create your own Activity Type
          </a>
          .
        </p>
      </DialogContent>
    </Dialog>
  );
}
