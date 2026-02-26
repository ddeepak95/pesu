"use client";

import { Loader2 } from "lucide-react";

interface EvaluatingIndicatorProps {
  message?: string;
  overlay?: boolean;
}

export function EvaluatingIndicator({
  message = "Please wait while we evaluate your answer. This takes up to a minute.",
  overlay = true,
}: EvaluatingIndicatorProps) {
  if (overlay) {
    return (
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl bg-background/80 backdrop-blur-sm">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground text-center max-w-xs px-4">
          {message}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 p-4 border rounded-md text-center">
      <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
      <p className="text-xs mt-1">{message}</p>
    </div>
  );
}
