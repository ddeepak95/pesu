# Project conventions

## Client-side data reads (Supabase)

All client-side Supabase reads MUST flow through an SWR hook defined under
[`src/hooks/swr/`](src/hooks/swr). Components and client pages must NOT import
directly from `@/lib/queries/*`. This is enforced by ESLint
([`eslint.config.mjs`](eslint.config.mjs)).

Why:

- A single SWR middleware ([`src/lib/swr/middleware.ts`](src/lib/swr/middleware.ts))
  increments a global busy counter around every fetcher invocation, driving
  the global loading overlay
  ([`src/components/GlobalDataLoadingOverlay.tsx`](src/components/GlobalDataLoadingOverlay.tsx)).
  Imperative reads bypass this and show no overlay.
- SWR provides caching, deduping, and `mutate` invalidation that ad-hoc
  `useEffect` + `setLoading` flows reimplement poorly.

How to add a new read:

1. Add (or extend) a query function in [`src/lib/queries/*`](src/lib/queries).
2. Add a thin hook in [`src/hooks/swr/`](src/hooks/swr):
   ```ts
   export function useThing(id: string | null) {
     return useSWR<Thing | null>(id ? ["thing", id] : null, () => getThing(id!));
   }
   ```
3. Use the hook in components. For derived state use `useMemo` over `data`.

## Loading UX

- Reads: do NOT add per-component `useState` loading flags or local spinners
  for client reads. The global overlay handles it. Use `data === undefined`
  inside the page only when the page must render a placeholder layout.
- Mutations (button-driven writes): keep local `isPending` button state and
  `Loader2` patterns. The global overlay is intentionally read-only.
- Route segment pending: add a `loading.tsx` next to `page.tsx` for slow
  segments (see [`src/app/teacher/loading.tsx`](src/app/teacher/loading.tsx)).

## Cache invalidation

After a mutation, call `mutate(key)` (or a tagged invalidator like
`invalidateCompletionsCache`) instead of re-running an imperative fetch.

## Server components and route handlers

Server components, route handlers, and `server-only` helpers are exempt from
the rule above and may import `@/lib/queries/*` directly (the lint rule
applies only to `src/components/**` and `src/app/**/*Client*.{ts,tsx}`).
