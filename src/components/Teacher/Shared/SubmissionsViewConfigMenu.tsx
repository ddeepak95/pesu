"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProfileField } from "@/types/profileFields";
import { ProgressViewConfig } from "@/types/class";
import { saveProgressViewConfig } from "@/lib/queries/classes";
import { useProgressViewConfig } from "@/hooks/swr";
import ConfigCheckboxRow from "./ConfigCheckboxRow";

interface SubmissionsViewConfigMenuProps {
  classDbId: string;
  profileFields: ProfileField[];
  disabled?: boolean;
}

/**
 * Self-contained view config for a class's submission tables: which profile
 * fields show under student names (`display_fields`) and which dropdown fields
 * are offered as filters (`filter_fields`). Persists to the shared, class-level
 * `progress_view_config` (preserving its other keys) so every submission table
 * for the class stays in sync.
 */
export default function SubmissionsViewConfigMenu({
  classDbId,
  profileFields,
  disabled = false,
}: SubmissionsViewConfigMenuProps) {
  const configQuery = useProgressViewConfig(classDbId);
  const cfg = configQuery.data;
  const [saving, setSaving] = useState(false);

  const displaySet = useMemo(
    () => new Set(cfg?.display_fields ?? []),
    [cfg]
  );
  const filterSet = useMemo(
    () => new Set(cfg?.filter_fields ?? []),
    [cfg]
  );

  // Only dropdown fields with options can act as filters.
  const filterableFields = useMemo(
    () =>
      profileFields.filter(
        (f) => f.field_type === "dropdown" && f.options && f.options.length > 0
      ),
    [profileFields]
  );

  if (profileFields.length === 0) return null;

  const persist = async (next: ProgressViewConfig) => {
    setSaving(true);
    try {
      await saveProgressViewConfig(classDbId, next);
      // Update the shared cache so this and every other submission table for the
      // class re-render without a refetch.
      await configQuery.mutate(next, { revalidate: false });
    } finally {
      setSaving(false);
    }
  };

  const baseConfig = (): ProgressViewConfig => ({
    display_fields: cfg?.display_fields ?? [],
    filter_fields: cfg?.filter_fields ?? [],
    ...(cfg?.columns ? { columns: cfg.columns } : {}),
  });

  const toggleDisplay = (fieldId: string) => {
    const next = baseConfig();
    const set = new Set(next.display_fields);
    if (set.has(fieldId)) set.delete(fieldId);
    else set.add(fieldId);
    next.display_fields = Array.from(set);
    void persist(next);
  };

  const toggleFilter = (fieldId: string) => {
    const next = baseConfig();
    const set = new Set(next.filter_fields);
    if (set.has(fieldId)) set.delete(fieldId);
    else set.add(fieldId);
    next.filter_fields = Array.from(set);
    void persist(next);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            title="Configure table columns and filters"
            aria-label="Configure which profile details and filters show"
            disabled={disabled || saving}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Configure
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[280px] p-3 bg-background text-foreground"
        >
          <p className="text-sm font-medium mb-2">Table settings</p>

          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            Profile details
          </p>
          <div className="max-h-[200px] overflow-y-auto pr-1">
            {profileFields.map((field) => (
              <ConfigCheckboxRow
                key={`display-${field.id}`}
                id={`display-cfg-${field.id}`}
                label={field.field_name}
                tip={`Show the "${field.field_name}" profile field under student names.`}
                checked={displaySet.has(field.id)}
                onToggle={() => toggleDisplay(field.id)}
                disabled={saving}
              />
            ))}
          </div>

          {filterableFields.length > 0 && (
            <>
              <div className="my-2 border-t border-border" />
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                Filters
              </p>
              {filterableFields.map((field) => (
                <ConfigCheckboxRow
                  key={`filter-${field.id}`}
                  id={`filter-cfg-${field.id}`}
                  label={field.field_name}
                  tip={`Offer "${field.field_name}" as a filter dropdown above the table, so you can narrow the roster by its values.`}
                  checked={filterSet.has(field.id)}
                  onToggle={() => toggleFilter(field.id)}
                  disabled={saving}
                />
              ))}
            </>
          )}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
