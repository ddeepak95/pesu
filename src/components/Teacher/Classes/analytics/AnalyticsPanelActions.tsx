"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AnalyticsPanelActionsProps {
  onDownloadPng: () => void;
}

export default function AnalyticsPanelActions({
  onDownloadPng,
}: AnalyticsPanelActionsProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Download PNG"
            onClick={onDownloadPng}
          >
            <Download className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Download PNG</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
