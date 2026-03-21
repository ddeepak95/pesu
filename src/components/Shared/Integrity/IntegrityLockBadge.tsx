"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getIntegrityRevokedLabel } from "@/lib/integrity/reasonLabels";

interface IntegrityLockBadgeProps {
  revokedAt: string | null | undefined;
  reasonCode: string | null | undefined;
}

export function IntegrityLockBadge({
  revokedAt,
  reasonCode,
}: IntegrityLockBadgeProps) {
  if (!revokedAt) return null;

  const label = getIntegrityRevokedLabel(reasonCode);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-default shrink-0 items-center rounded-md border border-destructive/50 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
            Access locked
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
          <p className="text-xs opacity-80">
            {new Date(revokedAt).toLocaleString()}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
