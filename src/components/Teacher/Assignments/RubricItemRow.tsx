"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RubricItem } from "@/types/assignment";
import { X } from "lucide-react";

interface RubricItemRowProps {
  item: RubricItem;
  index: number;
  onChange: (index: number, field: keyof RubricItem, value: string | number) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
  /** Hides the remove button entirely (view mode) rather than just disabling it. */
  hideRemove?: boolean;
  /** View mode: fields render read-only (full-contrast text) instead of disabled/greyed. */
  readOnly?: boolean;
  /** Placeholder for the item text input (varies by activity type). */
  itemPlaceholder?: string;
}

export default function RubricItemRow({
  item,
  index,
  onChange,
  onRemove,
  disabled = false,
  hideRemove = false,
  readOnly = false,
  itemPlaceholder = "Rubric item description",
}: RubricItemRowProps) {
  return (
    <div className="flex gap-2 items-start">
      <div className="flex-1">
        <Input
          placeholder={itemPlaceholder}
          value={item.item}
          onChange={(e) => onChange(index, "item", e.target.value)}
          disabled={disabled && !readOnly}
          readOnly={readOnly}
        />
      </div>
      <div className="w-32">
        <Input
          type="number"
          placeholder="Points"
          value={item.points || ""}
          onChange={(e) => onChange(index, "points", parseInt(e.target.value) || 0)}
          disabled={disabled && !readOnly}
          readOnly={readOnly}
          min={0}
        />
      </div>
      {!hideRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onRemove(index)}
          disabled={disabled}
          className="mt-0"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}





