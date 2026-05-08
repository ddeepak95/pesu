"use client";

import ConvoedSymbolLoader from "@/components/ConvoedSymbolLoader";
import { useIsBusy } from "@/lib/swr/busyStore";

/**
 * Single global overlay rendered when any SWR fetcher is in flight. Mounted
 * once in the root layout (inside `SWRProvider`). Local component "loading"
 * UI for client reads should be removed in favor of this overlay.
 */
export default function GlobalDataLoadingOverlay() {
  const busy = useIsBusy();

  if (!busy) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/60 backdrop-blur-sm"
    >
      <ConvoedSymbolLoader />
    </div>
  );
}
