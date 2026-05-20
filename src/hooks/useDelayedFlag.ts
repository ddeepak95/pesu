"use client";

import { useEffect, useState } from "react";

/**
 * True after `delayMs` while `active` is true. Resets when `active` goes false.
 */
export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => setReady(true), delayMs);
    return () => {
      window.clearTimeout(id);
      setReady(false);
    };
  }, [active, delayMs]);

  return active && ready;
}
