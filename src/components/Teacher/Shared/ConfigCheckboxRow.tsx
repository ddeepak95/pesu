"use client";

import { Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ConfigCheckboxRowProps {
  id: string;
  label: string;
  /** Info-tooltip copy explaining what enabling this does. */
  tip: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

/**
 * A checkbox + label + info-tooltip row used inside table-config popovers.
 * Must be rendered under a `TooltipProvider`.
 */
export default function ConfigCheckboxRow({
  id,
  label,
  tip,
  checked,
  onToggle,
  disabled,
}: ConfigCheckboxRowProps) {
  return (
    <div className="flex items-center gap-2 py-1">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={onToggle}
        disabled={disabled}
      />
      <Label
        htmlFor={id}
        className="text-sm font-normal leading-tight cursor-pointer flex-1"
      >
        {label}
      </Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label={`What does "${label}" show?`}
            onClick={(e) => e.preventDefault()}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[240px] text-left">
          {tip}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
