"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ContentDuplicateMode } from "@/lib/contentPlacements";

export function DuplicateContentModeSelect({
  value,
  onChange,
  linkedDisabled,
  id = "duplicate-content-mode",
}: {
  value: ContentDuplicateMode;
  onChange: (v: ContentDuplicateMode) => void;
  linkedDisabled?: boolean;
  id?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Duplicate as</Label>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as ContentDuplicateMode)}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="copy">Independent copy</SelectItem>
          <SelectItem value="linked" disabled={linkedDisabled}>
            Linked duplicate (shared material)
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
