"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface StickyFooterProps {
  /** Classes merged onto the floating bar (e.g. to override `max-w-*`). */
  className?: string;
  children: React.ReactNode;
}

/**
 * A floating action bar pinned to the bottom of the viewport. Uses
 * `position: fixed` (not `sticky`) because the app sets `overflow-x: hidden` on
 * `body`, which turns the body into a scroll container and breaks sticky
 * positioning for descendants.
 *
 * The bar is a centered, content-width card with rounded top corners and a top
 * shadow so it reads as floating above the page. The outer wrapper is
 * click-through (`pointer-events-none`) so the empty areas beside the card don't
 * block the content behind them; the card itself re-enables pointer events.
 *
 * Note: because the bar is removed from flow, give the scrolling container some
 * bottom padding so its last content isn't hidden behind the bar.
 */
export function StickyFooter({ className, children }: StickyFooterProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4">
      <div
        className={cn(
          "pointer-events-auto w-full max-w-5xl rounded-t-xl border border-b-0 bg-background/95 px-6 py-4 shadow-[0_-2px_12px_rgba(0,0,0,0.08)] backdrop-blur",
          "supports-[backdrop-filter]:bg-background/80",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
