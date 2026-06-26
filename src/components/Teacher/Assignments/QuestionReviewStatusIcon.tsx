"use client";

import { CheckCircle2, AlertCircle, Clock } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type QuestionReviewStatus = "reviewed" | "unreviewed" | "not-submitted";

const STATUS_CONFIG: Record<
  QuestionReviewStatus,
  { Icon: typeof CheckCircle2; className: string; label: string; tooltip: string }
> = {
  reviewed: {
    Icon: CheckCircle2,
    className: "text-green-600 dark:text-green-500",
    label: "Reviewed",
    tooltip: "Reviewed — grading confirmed for this question.",
  },
  unreviewed: {
    Icon: Clock,
    className: "text-orange-500",
    label: "Pending review",
    tooltip: "Submitted but not yet reviewed.",
  },
  "not-submitted": {
    Icon: AlertCircle,
    className: "text-red-500",
    label: "Not submitted",
    tooltip: "The student has not submitted an attempt for this question.",
  },
};

interface QuestionReviewStatusIconProps {
  status: QuestionReviewStatus;
  className?: string;
}

/**
 * Color-coded review-status indicator for a single question, with a tooltip
 * explaining what the color means. Green = reviewed, orange = pending review,
 * red = not submitted.
 */
export function QuestionReviewStatusIcon({
  status,
  className,
}: QuestionReviewStatusIconProps) {
  const { Icon, className: colorClassName, label, tooltip } = STATUS_CONFIG[status];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex" aria-label={label}>
            <Icon className={`h-4 w-4 ${colorClassName} ${className ?? ""}`} />
          </span>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
