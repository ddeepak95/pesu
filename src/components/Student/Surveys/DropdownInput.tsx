"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
      <Select
        value={value || undefined}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select an option…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option, idx) => (
            <SelectItem key={idx} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {required && !value && (
        <p className="text-xs text-muted-foreground">
          Please select an option
        </p>
      )}
    </div>
  );
}
