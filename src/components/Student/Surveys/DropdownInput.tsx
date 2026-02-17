"use client";

import { SearchableSelect } from "@/components/ui/searchable-select";

interface DropdownInputProps {
  options: string[];
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}

export default function DropdownInput({
  options,
  value,
  onChange,
  disabled = false,
  required = false,
}: DropdownInputProps) {
  return (
    <div className="space-y-2">
      <SearchableSelect
        value={value ?? ""}
        onValueChange={onChange}
        options={options}
        placeholder="Select an option…"
        disabled={disabled}
      />
      {required && !value && (
        <p className="text-xs text-muted-foreground">
          Please select an option
        </p>
      )}
    </div>
  );
}
