"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Filter } from "lucide-react";
import { ProfileField } from "@/types/profileFields";

export type ProfileFiltersState = Record<string, Set<string>>;

interface ProfileFieldFiltersProps {
  profileFields: ProfileField[];
  filterFieldIds: Set<string>;
  /** If provided, saves/restores selected checkbox values locally. */
  storageKey?: string;
  onFiltersChange: (filters: ProfileFiltersState) => void;
}

export default function ProfileFieldFilters({
  profileFields,
  filterFieldIds,
  storageKey,
  onFiltersChange,
}: ProfileFieldFiltersProps) {
  const [profileFilters, setProfileFilters] = useState<ProfileFiltersState>(
    {}
  );
  const [optionSearchByFieldId, setOptionSearchByFieldId] = useState<
    Record<string, string>
  >({});
  const [hasRestored, setHasRestored] = useState(false);

  const filterableFields = useMemo(() => {
    if (filterFieldIds.size === 0) return [];
    return profileFields.filter(
      (f) =>
        filterFieldIds.has(f.id) &&
        f.field_type === "dropdown" &&
        f.options &&
        f.options.length > 0
    );
  }, [profileFields, filterFieldIds]);

  const filterableFieldIdsKey = useMemo(() => {
    // stable enough for restore/persist effects
    return filterableFields
      .map((f) => f.id)
      .sort()
      .join("|");
  }, [filterableFields]);

  // Restore from localStorage.
  useEffect(() => {
    if (!storageKey) return;

    // Prevent pushing/persisting an empty state before restore completes.
    setHasRestored(false);
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return;

      const parsed = JSON.parse(stored) as Record<string, string[]>;
      const optionsByFieldId = new Map<string, Set<string>>();
      for (const f of filterableFields) {
        optionsByFieldId.set(f.id, new Set(f.options ?? []));
      }

      const restored: ProfileFiltersState = {};
      for (const [fieldId, values] of Object.entries(parsed)) {
        const options = optionsByFieldId.get(fieldId);
        if (!options) continue;
        const nextSet = new Set<string>(values.filter((v) => options.has(v)));
        if (nextSet.size > 0) {
          restored[fieldId] = nextSet;
        }
      }

      setProfileFilters(restored);
    } catch (err) {
      // Ignore localStorage errors
      console.warn("Failed to restore profile filters:", err);
    } finally {
      setHasRestored(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, filterableFieldIdsKey]);

  // Propagate filter changes to the parent after this component commits.
  useEffect(() => {
    if (!hasRestored) return;
    onFiltersChange(profileFilters);
  }, [profileFilters, onFiltersChange, hasRestored]);

  // Persist to localStorage on change.
  useEffect(() => {
    if (!storageKey || !hasRestored) return;

    try {
      const serialized: Record<string, string[]> = {};
      for (const [fieldId, values] of Object.entries(profileFilters)) {
        if (values.size > 0) serialized[fieldId] = Array.from(values);
      }
      localStorage.setItem(storageKey, JSON.stringify(serialized));
    } catch (err) {
      // Ignore localStorage errors
      console.warn("Failed to persist profile filters:", err);
    }
  }, [profileFilters, storageKey, hasRestored]);

  const toggleProfileFilterValue = (fieldId: string, value: string) => {
    setProfileFilters((prev) => {
      const currentSet = prev[fieldId] ?? new Set<string>();
      const nextSet = new Set(currentSet);
      if (nextSet.has(value)) {
        nextSet.delete(value);
      } else {
        nextSet.add(value);
      }

      const next: ProfileFiltersState = { ...prev };
      if (nextSet.size > 0) next[fieldId] = nextSet;
      else delete next[fieldId];

      return next;
    });
  };

  if (filterableFields.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {filterableFields.map((field) => {
        const activeCount = profileFilters[field.id]?.size ?? 0;
        const searchValue = optionSearchByFieldId[field.id] ?? "";
        const normalizedSearch = searchValue.trim().toLowerCase();

        const filteredOptions =
          normalizedSearch.length === 0
            ? field.options ?? []
            : (field.options ?? []).filter((opt) =>
                opt.toLowerCase().includes(normalizedSearch)
              );

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
              className="w-[240px] max-h-[300px] overflow-y-auto bg-background p-2 text-foreground"
            >
              <DropdownMenuLabel>{field.field_name}</DropdownMenuLabel>
              <DropdownMenuSeparator />

              <div className="py-1">
                <Input
                  value={searchValue}
                  onChange={(e) =>
                    setOptionSearchByFieldId((prev) => ({
                      ...prev,
                      [field.id]: e.target.value,
                    }))
                  }
                  placeholder="Search options..."
                  className="h-8"
                />
              </div>

              <DropdownMenuSeparator />

              {filteredOptions.length === 0 ? (
                <div className="text-xs text-muted-foreground px-2 py-2">
                  No matching options
                </div>
              ) : (
                filteredOptions.map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option}
                    checked={profileFilters[field.id]?.has(option) ?? false}
                    onCheckedChange={() =>
                      toggleProfileFilterValue(field.id, option)
                    }
                  >
                    {option}
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </div>
  );
}

