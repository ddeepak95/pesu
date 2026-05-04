"use client";

import { Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import InfoCallout from "@/components/Shared/InfoCallout";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const linkedMaterialPillClassName =
  "inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-700 dark:text-sky-300";

/** Sky “linked” pill with link icon (labels row, title row, etc.). */
export function LinkedMaterialPill({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span className={cn(linkedMaterialPillClassName, className)}>
      <Link2 className={cn("h-3 w-3 shrink-0", iconClassName)} aria-hidden />
    </span>
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
