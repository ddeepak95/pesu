import * as React from "react";
import { cn } from "@/lib/utils";

export type InfoBannerVariant = "info" | "warning" | "error";

const variantClasses: Record<InfoBannerVariant, string> = {
  info: "border-border bg-muted/40 text-foreground",
  warning:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
};

export interface InfoBannerProps {
  variant?: InfoBannerVariant;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** Shared presentational shell for class/page-level notices — compose with a variant and content. */
export function InfoBanner({
  variant = "info",
  icon,
  className,
  children,
}: InfoBannerProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        variantClasses[variant],
        className,
      )}
    >
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
