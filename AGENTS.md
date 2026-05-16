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

## Client-side navigation

All client components MUST use `useTrackedRouter` from
[`src/hooks/useTrackedRouter.ts`](src/hooks/useTrackedRouter.ts) instead of
`useRouter` from `next/navigation`. This is enforced by ESLint
([`eslint.config.mjs`](eslint.config.mjs)) for files under `src/components/**`
and `src/app/**/*Client*.{ts,tsx}`.

Why:

- `useTrackedRouter` wraps every `push/replace/back/forward/refresh` call in
  `startTransition` and ties React's `isPending` flag to the same global busy
  counter the SWR middleware uses. The result: the global overlay appears
  during the RSC fetch between click and target page mount, not only after
  the new page starts running its own data fetches.
- `useTransition` also keeps the previous page interactive while the next one
  loads, which is the React-recommended UX for slow navigations.

Other exports from `next/navigation` (`usePathname`, `useSearchParams`,
`useParams`, `redirect`, `notFound`) are not restricted and continue to be
imported directly.

The global overlay is now driven by three signals that all funnel through
[`src/lib/swr/busyStore.ts`](src/lib/swr/busyStore.ts):

1. SWR fetchers in flight (via `trackInFlight` middleware).
2. Imperative tracked reads (via [`src/lib/swr/imperativeReads.ts`](src/lib/swr/imperativeReads.ts)).
3. Pending route transitions (via `useTrackedRouter`).

`<Link>` from `next/link` is currently used only in a small set of landing,
auth, and legal pages. It is not wired to the busy store; if a heavy `<Link>`
navigation lands in a frequently used flow, prefer `useTrackedRouter` or wrap
it with a tracked link helper.

## Server components and route handlers

Server components, route handlers, and `server-only` helpers are exempt from
the rules above and may import `@/lib/queries/*` and `useRouter`-style
helpers directly (the lint rules apply only to `src/components/**` and
`src/app/**/*Client*.{ts,tsx}`).

## AI catalog (Supabase)

AI settings use the catalog only: `ai_provider_activations`, `ai_function_bindings`, and `ai_institution_settings` (policy locks). Scopes: platform, institution, class.

Migrations (greenfield order): [`supabase_ai_catalog.sql`](supabase-migrations/supabase_ai_catalog.sql) → [`supabase_ai_institution_settings.sql`](supabase-migrations/supabase_ai_institution_settings.sql) → [`supabase_ai_catalog_class_scope.sql`](supabase-migrations/supabase_ai_catalog_class_scope.sql) → [`supabase_ai_drop_capability_configs.sql`](supabase-migrations/supabase_ai_drop_capability_configs.sql).

- UI: [`useAiCatalogSettings`](src/hooks/swr/useAiCatalogSettings.ts) (platform / institution / class); institution policy via [`useInstitutionAiPolicy`](src/hooks/swr/useInstitutionAiPolicy.ts).
- Runtime: [`resolveModelConfig`](src/lib/ai/credentials/resolve.ts) → [`resolveCatalogModelConfigForClass`](src/lib/ai/catalog/resolveRuntime.ts) (requires `appFunctionKey`). Env fallback only when no class context (e.g. evaluate without assignment).

## AI invocation logging (internal)

When `AI_INVOCATION_LOGGING_ENABLED=true`, each LLM call writes an index row to `ai_invocations` and JSON payloads to GCS under `ai-logs/{invocation_id}/request.json` and `response.json` in the same bucket as submission files (`FIREBASE_STORAGE_BUCKET`). Access is service-role only (no client UI). Assistant `chat_messages` rows link via `ai_invocation_id`.
