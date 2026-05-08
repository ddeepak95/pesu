"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { LinkedMaterialPillWithInfoTooltip } from "@/components/Shared/LinkedMaterialPill";

interface PageTitleProps {
  title: string;
  badge?: React.ReactNode;
  /** Same material placed in more than one group in this class (teacher detail). */
  isLinked?: boolean;
  /** `default`: bordered section title. `hero`: large assignment-style heading, no bottom border. */
  variant?: "default" | "hero";
  className?: string;
}

export default function PageTitle({
  title,
  badge,
  isLinked = false,
  variant = "default",
  className,
}: PageTitleProps) {
  const isHero = variant === "hero";

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        !isHero && "border-b border-gray-500 pb-2",
        className,
      )}
    >
      {badge}
      <div className="flex items-center gap-2 min-w-0">
        <h1
          className={cn(
            "min-w-0 flex-1 truncate",
            isHero ? "text-3xl font-bold" : "text-xl",
          )}
        >
          {title}
        </h1>
        {isLinked && <LinkedMaterialPillWithInfoTooltip />}
      </div>
    </div>
  );
}
