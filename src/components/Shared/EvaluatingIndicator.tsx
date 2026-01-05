"use client";

import { Loader2 } from "lucide-react";

interface EvaluatingIndicatorProps {
  message?: string;
}

export function EvaluatingIndicator({
  message = "Please wait while we evaluate your answer. This takes up to a minute.",
}: EvaluatingIndicatorProps) {
  return (
    <div className="mt-4 p-4 border rounded-md text-center">
      <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
      <p className="text-xs mt-1">{message}</p>
    </div>
  );
}




