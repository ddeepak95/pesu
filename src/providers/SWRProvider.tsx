"use client";

import { SWRConfig } from "swr";

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        dedupingInterval: 10000, // 10s dedup window — avoids repeated calls for the same key
        revalidateOnFocus: false, // Don't re-fetch when the tab regains focus
        revalidateOnReconnect: false, // Don't re-fetch on network reconnect
        errorRetryCount: 2, // Retry failed requests up to 2 times
      }}
    >
      {children}
    </SWRConfig>
  );
}
