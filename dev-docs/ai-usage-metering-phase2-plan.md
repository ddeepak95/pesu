# Phase 2 — AI Usage Metering: Counters + Reconcile + Runtime Backstops

Companion implementation plan for `dev-docs/ai-usage-metering-plan.md` §9 point 2. That doc remains the source of truth for the overall design and revision history; this file is the concrete, sequenced implementation plan for Phase 2 specifically, written after exploring the actual Phase-1 code on `usage-metering` (not derived from the plan doc's prose alone — every file:line reference below was verified against the real code this session).

## Context

Phase 1 (gateway inversion, always-on `ai_invocations` capture, rate card, build-gated exhaustiveness checks) shipped earlier this session and is live on `usage-metering`. Phase 2 closes three remaining gaps before any wallet/enforcement work (Phase 3) can be trusted:

1. **No rollup table.** Every "how much has institution X spent" question today means scanning `ai_invocations` directly — no O(1) analytics read exists yet (`ai_usage_counters`, §4.5, doesn't exist in code).
2. **No drift/health check.** Nothing catches a silently-failed write, a null-cost row (unpriced model), an unattributed row, or a request that crashed mid-flight and got stuck `pending` forever.
3. **No runtime backstop.** `src/lib/ai/gateway/context.ts` is a stub — attribution (`userId` especially: confirmed **0 of 8** current call sites set it) relies entirely on each route remembering to pass it explicitly, with no ambient fallback and no fail-closed detection if one is missed. There's also no transport-layer catch-all if some future SDK surface bypasses the normal `startAiInvocation`/`completeAiInvocation` funnel.

Two architectural decisions were confirmed with the user before this plan was written:
- **Scheduling: `pg_cron`**, not Vercel Cron. This repo has zero cron infra today (no `pg_cron`/`pg_net` extension, no `vercel.json`, no GitHub Actions, no Supabase Edge Functions — verified via migration grep). The nightly reconcile job is pure SQL aggregation with no external API calls, and Phase 3 will need the same pattern again for its monthly credit-grant job — `pg_cron` avoids ever wrapping a growing full-table aggregation in an HTTP request with a timeout ceiling.
- **Runtime backstops: full §7.4 scope** — both the AsyncLocalStorage ambient context *and* the instrumented-fetch transport-layer catch-all, not deferring either part.

---

## Design decisions

**D1 — `key_owner` is derived in SQL at aggregation time, never persisted.** `ai_invocations.ai_key_source` (`"platform" | "institution" | "class" | "env" | "unconfigured"`) already exists and is written at insert (`recordInvocation.ts:210`). Rather than adding a new `key_owner` column that could drift from `ai_key_source`, a single SQL function `public.key_owner_from_source(text) returns text` (`platform`/`env` → `'platform'`; `institution`/`class` → `'byok'`; anything else → `'platform'` fail-safe, flagged separately by the reconcile job) is the one source of truth, called by both the hot-path upsert and the nightly rebuild. This matches §4.5's framing of counters as "a pure cache... rebuildable by re-aggregating the base table."

**D2 — the counter upsert is fire-and-forget, never awaited.** `completeAiInvocation` is already on the response-blocking path for two of three funnels (`structured.ts:88` generateText, and STT/TTS synthesis) — confirmed by reading `recordInvocation.ts` in full. Adding a synchronous RPC there would add latency to every AI response. Per §7.4's explicit rule ("metering never blocks the user call"), the new `record_usage_counter` RPC is fired via `void service.rpc(...).catch(...)`, with failures logged to `app_logs` and picked up by the nightly reconcile's drift check — never rethrown, never awaited by the caller.

**D3 — double-logging in the fetch backstop is prevented by a second, purpose-built AsyncLocalStorage "funnel marker."** Every legitimate provider call already runs inside a `startAiInvocation`/`completeAiInvocation` bracket, so a naive instrumented fetch would flag ~100% of normal traffic as an anomaly. A second ALS store (`fetchCoverage.ts`) is `.run()`'d around the exact SDK call (`structured.ts:88`, `turnStream.ts:170`, and each `speech.ts` provider call) — the instrumented fetch checks this marker and only writes a skeletal row when it's unset. **Known limitation, accepted as-is:** this proves "some funnel bracket was open somewhere in the async chain," not "this exact fetch was the one that bracket meant to cover" — irrelevant today since every funnel issues exactly one provider call per bracket. **WebSocket sessions (Cartesia/Sarvam TTS) are outside this backstop's reach** — they never call `fetch`, and already self-meter via their own explicit open/close bracket in `speech.ts`, so this is an acceptable, documented gap rather than a silent one.

**D4 — ALS context's practical payoff today is `userId` + fail-closed detection, not `institutionId`.** `persistAiInvocationStart` already authoritatively resolves `institution_id` from `classId` via `resolveInstitutionId` (`recordInvocation.ts:198-200`), and all 8 current call sites always know `classId` — so routes don't need to also resolve and pass `institutionId` into `runWithAiContext` (that field stays available for a future platform-scope route that has no class). What ALS actually fixes today: **`user_id` is currently always `null`** on every row from these 8 routes (none of them call `supabase.auth.getUser()` before invoking the gateway), and there is currently zero detection if a future call site forgets to pass context entirely.

---

## Implementation

### 1. Migration — `ai_usage_counters` + `record_usage_counter()`

New file `supabase/migrations/20260714000000_ai_usage_counters.sql`:
- `ai_usage_counters` table: `institution_id uuid not null references institutions(id)`, `class_id uuid not null default '00000000...0000'` (sentinel for institution-wide rows — deliberately no FK, matching §4.5's rationale), `key_owner text not null`, `period_start date not null`, `usage_type text not null` (or `'all'`), `credits numeric(20,8) not null default 0`, `events bigint not null default 0`, `updated_at timestamptz not null default now()`. PK `(institution_id, class_id, key_owner, period_start, usage_type)`.
- RLS: SELECT policy mirrors the existing `ai_invocations` policy (`supabase/migrations/20260713000000_ai_invocations_metering.sql:50-55`) — super admin, institution admin, or class teacher/admin (using the existing `is_platform_super_admin()`/`is_institution_admin()`/`is_class_teacher_admin()` helpers, confirmed present in the migrations). No write policies — service-role only, same convention as `ai_invocations`/`app_logs`.
- `public.key_owner_from_source(text) returns text` — the D1 mapping, `language sql immutable`.
- `public.record_usage_counter(p_institution_id uuid, p_class_id uuid, p_ai_key_source text, p_started_at timestamptz, p_usage_type text, p_credits numeric) returns void` — `security definer` plpgsql. Computes `period_start` as UTC calendar-month start (matches plan §10 decision #6), calls `key_owner_from_source`, and upserts **4 rows** via a `values (...) cross join`-style fan-out: `(inst, class, usage_type)`, `(inst, class, 'all')`, `(inst, SENTINEL, usage_type)`, `(inst, SENTINEL, 'all')`, each `on conflict ... do update set credits = credits + excluded.credits, events = events + 1`. No-ops (returns early) if `p_institution_id` is null.
- `revoke execute ... from anon, authenticated` on both functions.

*Verify:* apply the migration, then manually call `record_usage_counter` twice with the same args in the SQL editor — confirm the first call produces 4 rows and the second accumulates (`credits`/`events` both increase) rather than overwriting.

### 2. Migration — `pg_cron` + nightly reconcile

New file `supabase/migrations/20260714010000_pg_cron_usage_reconcile.sql`:
- `create extension if not exists pg_cron with schema extensions;` (flag: if this fails on Supabase due to platform permissions, enable it once via Dashboard → Database → Extensions, then re-run — the rest of the migration still applies).
- `public.reconcile_ai_usage_counters() returns void` — `security definer` plpgsql, does, in order:
  1. Snapshots current institution-wide totals (sentinel `class_id`, `usage_type='all'`) into a temp table.
  2. **Full rebuild**: `truncate table ai_usage_counters` then re-`insert...select...group by` from `ai_invocations` (where `status='completed' and credits is not null and institution_id is not null`), using `key_owner_from_source` for consistency with the hot path. Chosen over incremental diffing because §4.5 explicitly frames this table as a rebuildable cache — full rebuild is simpler and eliminates an entire class of diff bugs; both steps run inside one function invocation so no reader observes an empty table.
  3. **Drift check**: compares the pre-rebuild snapshot to the freshly rebuilt sentinel totals; any institution/key_owner pair that moved by more than $0.01 worth of credits gets a `warn`-level `app_logs` row (`event: 'counter_drift'`) — this is the signal that the fire-and-forget RPC from step 3 below silently failed at least once since the last run.
  4. **Anomaly flags**, each an `app_logs` insert when count > 0: `null_cost_rows` (completed, `cost_usd is null`, last 2 days), `unattributed_rows` (`app_function_key = 'unattributed'`, last 2 days — the ALS fail-closed prod-degrade signal), `stuck_pending_rows` (`status='pending'` older than 60 minutes — comfortably past any legitimate in-flight call in this app), `unmapped_key_source` (`ai_key_source` outside the 4 known values, last 2 days — flags D1's fail-safe default firing).
- `select cron.schedule('ai-usage-counters-nightly-reconcile', '0 8 * * *', $$ select public.reconcile_ai_usage_counters(); $$);` — daily 08:00 UTC (low-traffic window for a US-institution-heavy base); revisit once real traffic is observed.

*Verify:* manually `select public.reconcile_ai_usage_counters();`, confirm `ai_usage_counters` repopulates and `select * from cron.job;` shows the schedule. Deliberately backdate one row's `started_at` and insert one `app_function_key='unattributed'` row to confirm both anomaly flags fire in `app_logs` on the next manual call.

### 3. `recordInvocation.ts` wiring

Both changes in `src/lib/ai/logging/recordInvocation.ts`:
- **`completeAiInvocation`**: extend the existing re-read at line 307-311 from `.select("ai_model_id, usage_type")` to also select `ai_key_source, institution_id, class_id, started_at` (one extra round-trip is already happening there — no new query). After the `.update()` at line 383-403 succeeds and `computed.credits != null`, fire `void service.rpc("record_usage_counter", {...}).then(({ error }) => { if (error) logAppEvent({ level: "warn", source: "usage_metering", event: "counter_upsert_failed", ... }); })` — not awaited, per D2.
- **`persistAiInvocationStart`** (lines 190-241): read ambient context via the new `getAiContext()` (§4 below); resolve `userId`/`classId` as `input.X ?? ambient?.X ?? null`. If nothing resolves at all (`ambient === undefined && classId == null && userId == null`): in non-production, `throw new AiContextMissingError(...)`; in production, insert with `app_function_key: "unattributed"` (widened to `string` locally — no DB constraint blocks this) and log an `error`-level `app_logs` row (`event: 'ai_context_missing'`). `institutionId` resolution stays exactly as-is (`resolveInstitutionId` from `classId`, line 198-200) — per D4, ALS's `institutionId` is only consulted as a fallback when there's no `classId` at all.

*Verify:* run one real AI request locally, confirm `ai_usage_counters` gets 4 new/incremented rows matching the `ai_invocations` row's `credits`, and confirm response latency is unaffected (RPC is fire-and-forget).

### 4. `context.ts` → real AsyncLocalStorage

Rewrite `src/lib/ai/gateway/context.ts`: keep the `AiRequestContext` interface, add a module-level `new AsyncLocalStorage<AiRequestContext>()`, export `runWithAiContext(context, fn)`, `getAiContext()`, and `AiContextMissingError extends Error`. Re-export all three from `src/lib/ai/gateway/index.ts` alongside the existing `AiRequestContext` type export.

Wrap each of the 8 current call sites in `runWithAiContext({ userId, classId }, ...)`, resolving `userId` via `supabase.auth.getUser()` (existing precedent: `src/app/api/submissions/save-grades/route.ts:37-39`) right after `classDbId` is known:
- `src/app/api/multimodal/turn/route.ts` — wrap from `classDbId` resolution through the handler's end, **including** the `after(...)` registration at line 1000 (Node preserves ALS context into `after()` callbacks as long as `after()` itself is registered synchronously inside the wrapped continuation).
- `src/app/api/multimodal/tts/route.ts:53-58`
- `src/app/api/multimodal/transcribe/route.ts:104-109`
- `src/app/api/multimodal/transliterate/route.ts:40-42`
- `src/app/api/generate-rubric-and-answer/route.ts:103-105`
- `src/app/api/generate-dynamic-questions/route.ts:384-386`
- `src/app/api/evaluate/route.ts:149-159`
- `src/lib/multimodal/actions/resolveActionModel.ts` — no wrap needed, always called from an already-wrapped caller's continuation.

*Verify:* in dev mode, temporarily call the gateway with `runWithAiContext` omitted — confirm `AiContextMissingError` throws. With the wrap in place, hit each of the 8 routes normally and confirm `ai_invocations.user_id` is now populated (previously always `null`). With `NODE_ENV=production` locally (`npm run build && npm run start`), simulate missing context and confirm graceful degrade to `app_function_key='unattributed'` plus the `app_logs` row, not a thrown error.

### 5. Instrumented fetch backstop

- New `src/lib/ai/gateway/fetchCoverage.ts` — second ALS store, `withFunnelCoverage(fn)` / `isFunnelCovered()` (the D3 marker).
- New `src/lib/ai/gateway/instrumentedFetch.ts` — one stable module-level `fetch`-compatible function. Runs the real `fetch`, and if `!isFunnelCovered()` after it resolves (or throws), fires a fire-and-forget insert of a skeletal `ai_invocations` row (`app_function_key: 'gateway.unmetered_transport'`, attribution from `getAiContext()`) plus an `error`-level `app_logs` row. Must stay a single stable reference (not reconstructed per call) because `getOpenAIClient` caches its client singleton.
- `src/lib/ai/provider.ts:15` (`getLanguageModel`) — add an optional `fetchImpl?: typeof fetch` param, threaded into both `createGoogleGenerativeAI({ apiKey, fetch: fetchImpl })` and `createOpenAI({ apiKey, fetch: fetchImpl })`. `provider.ts` stays agnostic of the gateway — caller supplies the implementation.
- `src/lib/ai/gateway/model.ts:127` — `getLanguageModel(config)` → `getLanguageModel(config, instrumentedFetch)`.
- `src/lib/ai/gateway/structured.ts:88` and `turnStream.ts:170` — wrap the `generateText(...)`/`streamObject(...)` calls in `withFunnelCoverage(() => ...)`.
- Speech providers: add `fetchImpl?: typeof fetch` to `TranscribeInput`/`SynthesizeInput` (`src/lib/konvo-voice/speech/types.ts`), threaded into the 4 raw-`fetch` provider files (Cartesia/Sarvam TTS+STT) and into `getOpenAIClient` (`src/lib/konvo-voice/speech/providers/openai/client.ts`, passed as the SDK's own `fetch` client option — safe with the existing apiKey-only cache since `instrumentedFetch` is one stable reference). `src/lib/ai/gateway/speech.ts` is the only file that imports `instrumentedFetch` on the speech side, passing it into every provider call and wrapping each in `withFunnelCoverage`. WS sessions (`openSynthesisSession`) are explicitly untouched — see D3.

*Verify:* make one real AI call, confirm **no** `gateway.unmetered_transport` row appears (proves the marker suppresses normal traffic). Temporarily remove one `withFunnelCoverage` wrap, confirm a skeletal row **does** appear, then revert. Run `npm run validate:ai-metering` after every file touched here specifically — `assertGatewayImportBoundaryHolds()` will catch it if `instrumentedFetch.ts`/`fetchCoverage.ts` leak outside the gateway boundary.

---

## Sequencing

1. **Counters migration** (§1) — purely additive SQL, zero call sites touched, safe to ship idle.
2. **`recordInvocation.ts` RPC wiring** (§3, counter half only) — small isolated diff, depends on step 1.
3. **Reconcile migration** (§2) — depends on step 1's schema; landing after step 2 means its first drift check has real live data instead of an empty table.
4. **ALS context** (§3 fail-closed half + §4) — land together as one unit (the fail-closed check is meaningless without `context.ts`, and the wraps are meaningless without something reading them). Land after 1-3 are proven stable in isolation, since this is the highest-risk step (8 route files touched, adds a dev-mode throw).
5. **Fetch backstop** (§5) — depends on `context.ts` (step 4) for attribution on skeletal rows; otherwise independent. Land last — lowest value-per-line-of-diff (a catch-all that shouldn't fire in steady state) and touches the most files, so isolating it makes any regression easy to bisect.

Every step ships in a state where the app is fully functional — nothing depends on a later step to be safe in production.

## Verification (every step)

No test runner/CI in this repo. After each step: `npx tsc --noEmit`, `npm run lint`, `npm run validate:ai-metering`, `npm run build`. Per-step manual/SQL verification is detailed inline above.
