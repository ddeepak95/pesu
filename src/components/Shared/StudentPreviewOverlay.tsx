"use client";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Eye, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
const subscribe = () => () => {};
export function StudentPreviewOverlay({
  children,
  onExit,
  onRestart,
  restartDisabled,
  restarting,
}: {
  children: ReactNode;
  onExit: () => void;
  onRestart: () => void;
  restartDisabled?: boolean;
  restarting?: boolean;
}) {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  useEffect(() => {
    const body = document.body.style.overflow;
    const html = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = body;
      document.documentElement.style.overflow = html;
    };
  }, []);
  if (!mounted) return null;
  return createPortal(
    <div
      className="grain-canvas fixed inset-0 z-50 flex flex-col bg-canvas"
      role="dialog"
      aria-modal="true"
      aria-label="Preview as Student"
    >
      <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Eye className="h-4 w-4 text-primary" />
          Preview as Student
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRestart}
            disabled={restartDisabled || restarting}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            {restarting ? "Restarting..." : "Restart preview"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onExit}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            Exit preview
          </Button>
        </div>
      </div>
      {children}
    </div>,
    document.body,
  );
}
