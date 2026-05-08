import type { Middleware } from "swr";
import { increment, decrement } from "./busyStore";

/**
 * SWR middleware that wraps every fetcher invocation with the global busy
 * counter. Because it operates on the fetcher (not the hook), revalidation,
 * focus refetches, and parallel keys all participate uniformly.
 *
 * The `finally` block guarantees the counter returns to zero on errors, so
 * the overlay can never get stuck.
 *
 * SWR's `Middleware` type uses generics that flow through `useSWRNext`. Because
 * we only side-effect (we don't reshape the data), we forward the wrapped
 * fetcher with `any`-typed args, matching the pattern in SWR's official docs.
 */
export const trackInFlight: Middleware = (useSWRNext) => {
  return (key, fetcher, config) => {
    const wrapped =
      fetcher === null
        ? null
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async (...args: any[]) => {
            increment();
            try {
              return await fetcher(...args);
            } finally {
              decrement();
            }
          };
    return useSWRNext(key, wrapped, config);
  };
};
