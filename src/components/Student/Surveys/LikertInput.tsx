"use client";

import { LikertOption } from "@/types/survey";
import { cn } from "@/lib/utils";

interface LikertInputProps {
  options: LikertOption[];
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
  required?: boolean;
}

export default function LikertInput({
  options,
  value,
  onChange,
  disabled = false,
  required = false,
}: LikertInputProps) {
  const sortedOptions = [...options].sort((a, b) => a.value - b.value);

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
        {sortedOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => !disabled && onChange(option.value)}
            disabled={disabled}
            className={cn(
              "flex items-center justify-center px-4 py-3 rounded-lg border-2 transition-all",
              "sm:min-w-[100px] w-full sm:w-auto",
              "hover:border-primary hover:bg-primary/5",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
              value === option.value
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border bg-background",
              disabled &&
                "opacity-50 cursor-not-allowed hover:border-border hover:bg-background"
            )}
          >
            <span className="text-sm text-center">{option.text}</span>
          </button>
        ))}
      </div>
      {required && value === null && (
        <p className="text-xs text-muted-foreground">Please select an option</p>
      )}
    </div>
  );
}
