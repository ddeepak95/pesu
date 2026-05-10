"use client";

import { Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import InfoCallout from "@/components/Shared/InfoCallout";
import { Pill } from "@/components/ui/pill";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** “Linked across groups” pill with link icon (labels row, title row, etc.). */
export function LinkedMaterialPill({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <Pill purpose="linkedMaterial" className={className}>
      <Link2 className={cn("shrink-0", iconClassName)} aria-hidden />
    </Pill>
  );
}

const LINKED_CALLOUT_TITLE = "Linked across groups";

function LinkedMaterialExplainer() {
  return (
    <>
      <p>
        This item shares the same underlying material with another group in this
        class, so it can appear in more than one group feed.
      </p>
      <p className="mt-2">
        Edits apply everywhere it appears. You can remove it from one group’s feed
        while leaving it linked in others.
      </p>
    </>
  );
}

/** Pill + hover/focus tooltip using {@link InfoCallout} (teacher detail headers). */
export function LinkedMaterialPillWithInfoTooltip() {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="shrink-0 cursor-help rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Linked across groups — more information"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <LinkedMaterialPill />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="end"
          className="max-w-sm border-0 bg-transparent p-0 text-foreground shadow-xl"
        >
          <InfoCallout title={LINKED_CALLOUT_TITLE}>
            <LinkedMaterialExplainer />
          </InfoCallout>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
