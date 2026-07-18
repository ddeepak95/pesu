"use client";

import { useMemo } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import ConfigCheckboxRow from "@/components/Teacher/Shared/ConfigCheckboxRow";
import { ProfileField } from "@/types/profileFields";
import { ProgressViewConfig } from "@/types/class";
import {
  STUDENT_COLUMN_META,
  type ResolvedColumnVisibility,
  type StudentColumnKey,
} from "./studentsTableConfig";

/** Config key stored on `ProgressViewConfig.columns` for each built-in column. */
const COLUMN_CONFIG_KEY: Record<
  StudentColumnKey,
  keyof NonNullable<ProgressViewConfig["columns"]>
> = {
  group: "group",
  progress: "progress",
  lastCompleted: "last_completed",
  approvals: "approvals",
};

interface StudentsTableConfigMenuProps {
  profileFields: ProfileField[];
  savedConfig: ProgressViewConfig | null;
  visibility: ResolvedColumnVisibility;
  /** Group is only configurable when the class has more than one group. */
  groupCount: number;
  saving?: boolean;
  onSave: (next: ProgressViewConfig) => void;
}

function baseConfig(cfg: ProgressViewConfig | null): ProgressViewConfig {
  return {
    display_fields: cfg?.display_fields ?? [],
    filter_fields: cfg?.filter_fields ?? [],
    columns: { ...(cfg?.columns ?? {}) },
  };
}

export default function StudentsTableConfigMenu({
  profileFields,
  savedConfig,
  visibility,
  groupCount,
  saving = false,
  onSave,
}: StudentsTableConfigMenuProps) {
  const displaySet = useMemo(
    () => new Set(savedConfig?.display_fields ?? []),
    [savedConfig]
  );
  const filterSet = useMemo(
    () => new Set(savedConfig?.filter_fields ?? []),
    [savedConfig]
  );

  // Only dropdown fields with options can act as filters.
  const filterableFields = useMemo(
    () =>
      profileFields.filter(
        (f) =>
          f.field_type === "dropdown" && f.options && f.options.length > 0
      ),
    [profileFields]
  );

  const toggleProfileField = (fieldId: string) => {
    const next = baseConfig(savedConfig);
    const set = new Set(next.display_fields);
    if (set.has(fieldId)) set.delete(fieldId);
    else set.add(fieldId);
    next.display_fields = Array.from(set);
    onSave(next);
  };

  const toggleFilterField = (fieldId: string) => {
    const next = baseConfig(savedConfig);
    const set = new Set(next.filter_fields);
    if (set.has(fieldId)) set.delete(fieldId);
    else set.add(fieldId);
    next.filter_fields = Array.from(set);
    onSave(next);
  };

  const toggleColumn = (key: StudentColumnKey, current: boolean) => {
    const next = baseConfig(savedConfig);
    next.columns = { ...next.columns, [COLUMN_CONFIG_KEY[key]]: !current };
    onSave(next);
  };

  // Built-in columns offered in the config. Group only appears with >1 group.
  const builtInKeys: StudentColumnKey[] = [
    ...(groupCount > 1 ? (["group"] as StudentColumnKey[]) : []),
    "progress",
    "lastCompleted",
    "approvals",
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            title="Configure table columns"
            aria-label="Configure which columns show in the table"
            disabled={saving}
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

          {profileFields.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                Profile fields
              </p>
              <div className="max-h-[200px] overflow-y-auto pr-1">
                {profileFields.map((field) => (
                  <ConfigCheckboxRow
                    key={field.id}
                    id={`col-profile-${field.id}`}
                    label={field.field_name}
                    tip={`Show the "${field.field_name}" profile field as a column.`}
                    checked={displaySet.has(field.id)}
                    onToggle={() => toggleProfileField(field.id)}
                    disabled={saving}
                  />
                ))}
              </div>
              <div className="my-2 border-t border-border" />
            </>
          )}

          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            Details
          </p>
          {builtInKeys.map((key) => {
            const meta = STUDENT_COLUMN_META[key];
            return (
              <ConfigCheckboxRow
                key={key}
                id={`col-${key}`}
                label={meta.label}
                tip={meta.tip}
                checked={visibility[key]}
                onToggle={() => toggleColumn(key, visibility[key])}
                disabled={saving}
              />
            );
          })}

          {filterableFields.length > 0 && (
            <>
              <div className="my-2 border-t border-border" />
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                Filters
              </p>
              {filterableFields.map((field) => (
                <ConfigCheckboxRow
                  key={`filter-${field.id}`}
                  id={`filter-${field.id}`}
                  label={field.field_name}
                  tip={`Offer "${field.field_name}" as a filter dropdown above the table, so you can narrow the roster by its values.`}
                  checked={filterSet.has(field.id)}
                  onToggle={() => toggleFilterField(field.id)}
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
