"use client";

/**
 * Drop-in replacement for `useRouter` from `next/navigation` that wraps every
 * navigating call (`push`, `replace`, `back`, `forward`, `refresh`) in
 * `startTransition` and feeds the resulting `isPending` flag into the same
 * global busy counter that the SWR middleware uses
 * (see `src/lib/swr/busyStore.ts`).
 *
 * Why this exists:
 *   In the App Router, navigating between sibling routes under an already-
 *   mounted layout does not trigger any closer `loading.tsx` Suspense
 *   boundary, and no SWR fetcher is in flight during the RSC payload fetch.
 *   The result is a multi-second gap between click and the next page mount
 *   where nothing in the UI signals "loading".
 *
 *   `useTransition`'s `isPending` covers exactly that gap: it stays `true`
 *   from the moment `startTransition` is called until the transitioned-to
 *   route segment has finished rendering. Driving the existing busy store
 *   from it gives us the global overlay automatically, with no per-call-site
 *   spinner bookkeeping.
 *
 * Non-navigating router methods (`prefetch`) are forwarded unchanged.
 */

import { useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decrement, increment } from "@/lib/swr/busyStore";

type NextRouter = ReturnType<typeof useRouter>;
type NavigateOptions = Parameters<NextRouter["push"]>[1];

export interface TrackedRouter {
  push: (href: string, options?: NavigateOptions) => void;
  replace: (href: string, options?: NavigateOptions) => void;
  back: () => void;
  forward: () => void;
  refresh: () => void;
  prefetch: NextRouter["prefetch"];
}

export function useTrackedRouter(): TrackedRouter {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isPending) return;
    increment();
    return () => decrement();
  }, [isPending]);

  return useMemo<TrackedRouter>(
    () => ({
      push: (href, options) =>
        startTransition(() => {
          router.push(href, options);
        }),
      replace: (href, options) =>
        startTransition(() => {
          router.replace(href, options);
        }),
      back: () =>
        startTransition(() => {
          router.back();
        }),
      forward: () =>
        startTransition(() => {
          router.forward();
        }),
      refresh: () =>
        startTransition(() => {
          router.refresh();
        }),
      prefetch: router.prefetch.bind(router),
    }),
    [router]
  );
}
