import React from "react";
import { cn } from "@/lib/utils";

interface InfoCalloutProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export default function InfoCallout({
  title,
  children,
  className,
}: InfoCalloutProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-blue-200 bg-blue-50 p-4 text-foreground shadow-sm",
        "dark:border-blue-800 dark:bg-blue-950 dark:text-blue-50",
        className
      )}
    >
      <p className="mb-1 text-sm font-semibold text-foreground dark:text-blue-50">
        {title}
      </p>
      <div className="text-sm text-foreground/95 dark:text-blue-100">{children}</div>
    </div>
  );
}
