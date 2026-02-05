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
        "rounded-md border border-blue-200/60 bg-blue-50/10 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-50 p-4",
        className
      )}
    >
      <p className="mb-1 text-sm font-semibold">{title}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}
