import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  text: string;
  /** Merged onto the default icon classes (size, cursor, shrink). */
  iconClassName?: string;
  /** Accessible name for the icon trigger (defaults to "More information"). */
  ariaLabel?: string;
}

export function InfoTooltip({
  text,
  iconClassName,
  ariaLabel = "More information",
}: InfoTooltipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info
            className={cn(
              "h-4 w-4 text-muted-foreground cursor-help shrink-0",
              iconClassName,
            )}
            aria-label={ariaLabel}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p>{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
