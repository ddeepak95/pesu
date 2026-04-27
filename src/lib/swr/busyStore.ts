/**
 * Module-level ref-counted "busy" store consumed by the global data loading
 * overlay. Incremented and decremented exclusively by the SWR middleware
 * (see ./middleware.ts) so every in-flight `useSWR` fetcher contributes to a
 * single source of truth, with no per-call-site bookkeeping.
 */

import { useSyncExternalStore, useEffect, useState } from "react";

let inFlight = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function increment(): void {
  inFlight += 1;
  emit();
}

export function decrement(): void {
  inFlight = Math.max(0, inFlight - 1);
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): number {
  return inFlight;
}

function getServerSnapshot(): number {
  return 0;
}

/**
 * Returns whether any tracked fetcher is currently in flight. SSR-safe.
 */
export function useInFlightCount(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Returns `true` only after the busy state has held for `delayMs`. This
 * suppresses overlay flashes for cache hits and very fast network responses.
 *
 * Implementation note: when `isBusyNow` flips back to `false`, the derivation
 * `isBusyNow && debounced` ensures we report `false` immediately. The
 * `debounced` flag is only ever flipped asynchronously via `setTimeout`, so
 * we never call `setState` synchronously inside the effect body.
 */
export function useIsBusy(delayMs = 120): boolean {
  const count = useInFlightCount();
  const isBusyNow = count > 0;
  const [debounced, setDebounced] = useState(false);

  useEffect(() => {
    if (!isBusyNow) {
      const id = setTimeout(() => setDebounced(false), 0);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setDebounced(true), delayMs);
    return () => clearTimeout(id);
  }, [isBusyNow, delayMs]);

  return isBusyNow && debounced;
}
