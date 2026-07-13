# AI Usage Metering Plan

Status: **PLAN — implementation-ready, not started.** Written 2026-07-12.
Revised 2026-07-12 (v3): full call-site audit of the codebase; corrected the
emission-site inventory (the previous "five funnels" claim missed four
surfaces), fixed an invalid nullable-PK design in the counters table, promoted
direct-audio LLM input from "future" to "shipped". Revised 2026-07-12 (v4):
**Pipecat legacy voice excluded from scope** (deprecation planned), and
leak-proofing restructured from bolt-on guardrails into a **capability-based
AI gateway** (§7) that makes an unmetered call structurally impossible, now
and for future features. Revised 2026-07-12 (v5 — **implementation-ready**):
every load-bearing claim re-verified against the code (schema columns, call
sites, helper/class names, catalog constants all check out). Corrections
folded in: the quota error code is `QUOTA_EXCEEDED` (the `AiErrorCode` union
is uppercase); the repo has **no test runner and no CI workflows**, so the
§7.3 exhaustiveness check ships as a `prebuild`-gated tsx script;
`resolveInstitutionId` in `appLog.ts` is module-private and must be exported;
`resolveProviderApiKeyForAssignment` returns only the key string, so speech
key resolution must be extended to report the key **source**. Open questions
are converted to adopted defaults (§10), Phase 1 is expanded into an ordered
step sequence with acceptance criteria (§9.1), and the gateway API is pinned
(§7.1). Revised 2026-07-13 (v6): **BYOK usage can now be capped too** — the
v5 default ("BYOK skips the quota check entirely") protected platform money
but left institutions with no way to guard their own provider keys against a
bug or abuse. Counters and limits gain a **`key_owner`** dimension (`platform` |
`byok`) so both sides of the ledger are independently cappable (§4.5, §4.6,
§8, §10 #4). Revised 2026-07-13 (v7 — **scope pulled back to credits-only**):
v6 also added a local-currency FX boundary (`institutions.billing_currency`,
`fx_rates`, per-limit currency snapshots) so admins could set caps in ₹/€/etc.
**That's cut from this version.** Credits are the only unit anything in this
plan is denominated, allocated, capped, or displayed in — no `basis` column,
no FX table, no currency column on `institutions`. The BYOK-vs-markup concern
v6 solved with a `basis` field is instead solved one level down: a BYOK row's
`credits` are *always* the flat `cost_usd × 100` conversion, never subject to
whatever markup a future rate version applies to platform-paid credits (§4.4,
§10 #3) — so a BYOK cap set today still means the same thing later, with no
extra schema. Local-currency input/display is deferred, not designed away —
see the note at the end of §10. Also **expanded §8/Phase 4** with concrete
usage-distribution views (by model, modality, class, teacher, time) per the
"where is it being spent" requirement — the goal (§1) already named this;
this revision makes it concrete. Revised 2026-07-13 (v8 — **credits decoupled
from `cost_usd`; `cost_usd` dropped from counters**): two changes. (1)
**`cost_usd` removed from `ai_usage_counters` entirely** (§4.5) — nothing
reads a rolled-up dollar figure at that grain (enforcement only ever compares
`credits`; finance-facing cost views aggregate `ai_invocations` directly,
which is where `cost_usd` still lives, backend-only). (2) **The `credits =
cost_usd × 100` formula is gone.** It made fractional credits the norm, since
provider cost per call is routinely sub-cent. Each rate-card entry now
authors its own `creditUnitSize` — raw units (tokens/seconds/characters) per
whole credit, tuned per modality (§4.4) — and `credits = max(1, ceil(rawUnits
/ creditUnitSize))`, always a whole number, never zero. `cost_usd` and
`credits` are now two independent computations off the same raw metrics, not
one derived from the other. This also **removes the v7 "BYOK credits stay
flat" special case** (§4.6, §10 #4) — with credits no longer formula-derived
from `cost_usd`, there's nothing for a future platform markup to drag along,
so the dedicated `computeUsage.ts` branch it required is gone too. `credits`
columns change type accordingly: `ai_invocations.credits` → `integer`,
`ai_usage_counters.credits` → `bigint`, `ai_usage_limits.hard_cap_credits`/
`soft_warn_credits` → `integer`. Revised 2026-07-13 (v9 — **credits are exact
again, but never per-modality**): v8's whole-number `creditUnitSize` fixed the
decimal problem but broke a more important property — a credit no longer
meant the same real-dollar amount across modalities (in one worked example,
an STT credit and an LLM credit differed by ~17× in actual cost). v9 drops
`creditUnitSize` entirely in favor of **one global `CREDITS_PER_USD`
constant** applied uniformly via `cost_usd`, restoring fungibility. It also
drops **rounding/flooring at write time** altogether: `credits = cost_usd ×
CREDITS_PER_USD`, stored exact at the same `numeric(14,8)` precision as
`cost_usd`, never ceiling'd, floored, or rounded before being compared
(§8) or summed (§4.5) — rounding happens only in a display layer, which is
free to pick 0/1/2 decimals per screen without affecting what's metered.
Column types revert to `numeric`: `ai_invocations.credits` →
`numeric(14,8)`, `ai_usage_counters.credits` → `numeric(20,8)`,
`ai_usage_limits.hard_cap_credits`/`soft_warn_credits` → `numeric(14,4)`.
Keeping `credits` a distinct stored field (not `cost_usd` read through a
formatter) is deliberate — it's what leaves room for credits to mean
something other than "USD × a constant" later (margin, or decoupling from
any single currency) without touching enforcement, storage, or display.
Revised 2026-07-13 (v10 — **from a period-reset cap to a real credit
wallet**): `ai_usage_limits` — a static allocation compared against a
counter that reset every `period_start` — **replaced**. It couldn't
represent what institutions actually need: credits that accumulate month to
month (capped or not), and on-demand top-ups a class owner buys mid-period
without waiting for the next cycle. Neither fits a table with no memory
across periods. Researched how a real production usage-credit system
(Cartesia, already a provider in this plan) models the same problem — a
monthly allotment, a bounded rollover, and a separate overage/top-up path —
and adopted the shape: **§4.6** now defines `ai_credit_wallets` (policy:
nullable `monthly_grant` — `null` = no recurring renewal, pure top-up;
`max_balance` bounds only what rolls over into a new grant, never clamps a
top-up, since that's money already paid), `ai_credit_transactions`
(append-only ledger of grants/top-ups), and `ai_credit_balances` (the fast,
**not period-bucketed** number enforcement actually reads). `ai_usage_counters`
(§4.5) is unchanged in shape but **reframed as analytics-only** — it no
longer backs enforcement, which needs a balance that persists across
periods, not a per-period rollup. §5, §8, §9, §10, §11 updated throughout to
match: `assertWithinQuota` now reads `ai_credit_balances.balance` instead of
comparing a counter to a cap; `completeAiInvocation` gains a
`debit_wallet_balance` step alongside the (now purely analytical)
`record_usage_counter`; a new scheduled monthly grant job and a top-up
purchase endpoint (payment provider itself out of scope) join Phase 3.
Revised 2026-07-13 (v11 — **`payer` renamed to `key_owner`**): a pure
naming fix, no schema or semantics change. `payer` implied *who pays
money*, but the dimension it names is really *whose credentials served the
call* — an institution can pay the platform a subscription while running
entirely on platform-owned keys, which `payer='platform'` would have
mislabeled as "the platform pays." Values are unchanged (`'platform'` |
`'byok'`), still derived once, at write time, from `ai_key_source` (§4.5).
Renamed throughout: `ai_usage_counters.payer` → `key_owner`,
`ai_credit_wallets.payer` → `key_owner`, `record_usage_counter(p_payer)` →
`p_key_owner`, `getQuotaStatus({ payer })` → `{ keyOwner }`, and every
§4.5/§4.6/§8/§8.1/§9/§10/§11 cross-reference. Revised 2026-07-13 (v12 —
**`cached_input_tokens`/`reasoning_tokens` folded into `token_details`; a
proposed `(metric_value, metric_type, metric_source)` generalization for the
non-token metrics rejected**): re-examining v3's original justification for
promoting `cached_input_tokens`/`reasoning_tokens` to typed columns found it
didn't hold up — cost computation reads the provider's raw `usage` object
once, at write time, and never reads a persisted column back, so a column
buys nothing there; §8.1 has no "by token class" dashboard cut needing cheap
`sum()`; and the actual stated reason (§5.2: capture now because raw metrics
can't be recovered retroactively) is identical to `token_details`'s own
justification, so splitting these two out while leaving every other
token-class breakdown (audio/image-input tokens) in jsonb was an
unprincipled asymmetry, not a designed one. Both now live in `token_details`
alongside the rest, typed at the application layer (§4.1, §10 #14). Separately
considered and **rejected**: generalizing the *non-token* metrics
(`audio_ms`/`characters`/`audio_output_ms`/`session_ms`) the same way, via a
flat `(metric_value, metric_type, metric_source)` triple — it can only hold
one metric per row, but `text_to_speech` already needs `characters` *and*
`audio_output_ms` on the same row simultaneously (§5.1), so the triple would
force either a second row per invocation (violating §2's "one row per AI
call") or a real one-to-many child table, disproportionate for a metric set
that's small and bounded by an exhaustiveness-checked usage_type vocabulary
(§4.2, §7.3) rather than prone to per-provider proliferation the way token
classes are. §4.1, §10 (#14, new row) updated. Revised 2026-07-13 (v13 —
**§7.3's build-gate made concrete, incl. a Vercel-execution check**):
verified every "what exists today" claim in this plan against the codebase
(four independent passes: schema/DB, text-generation call sites, speech
call sites, gateway/catalog infra) — **all confirmed accurate**, down to
exact file:line locations. Two things worth landing before implementation
starts, both folded into §7.3: (1) the repo has **no `prebuild` hook today**
— `validate-locales.ts` is precedent only for the tsx-script *shape*
(top-level `assert*Valid()` calls that throw on the first violation), not
for build-blocking wiring, so this plan introduces the first build-gate this
repo has had, not an extension of one; (2) **confirmed, not assumed, that
the gate reaches Vercel** — this repo uses npm (`package-lock.json`, no
`pnpm-lock.yaml`/`yarn.lock`) with no `vercel.json` build-command override,
so Vercel's Next.js preset runs `npm run build`, which is exactly the
invocation npm's `prebuild` hook attaches to; a `vercel.json` override or a
pnpm repo without `enable-pre-post-scripts` would have silently defeated
this, so it needed checking rather than assuming. §7.3 now shows the
concrete script skeleton and states the `next dev`/`next start` boundary
(the gate only fires on `build`, not dev). Separately noted but **not yet
folded in pending confirmation**: `getProviderApiKeySource` already exists
(`src/lib/ai/catalog/buildEffectiveRuntime.ts:174-179`) and already returns
the key's supplying scope — §5.0/§7.2/§9.1 Step 4's "extend
`getProviderApiKey` to report supplying scope" is therefore a smaller task
(wire an existing primitive through) than currently written; left as-is
until confirmed.

## 1. Goal

Build a **holistic, authoritative meter** for every unit of AI work the platform
performs, so we can:

- **Limit usage** — enforce quotas / caps / soft warnings at **institution and
  class** granularity, with a cheap O(1) pre-flight check.
- **Charge customers** — produce a stable, auditable per-period **credit**
  balance/allocation per institution (and per class); customers only ever
  buy, allocate, and spend credits, never a currency (§4.4, §10 #3).
- **Track true cost internally** — a parallel, backend-only provider-cost
  (USD) ledger for margin visibility and invoice reconciliation, never
  surfaced to a customer (§4.4, §7.5).
- **Analyze** — power admin dashboards (usage by model, function, class, teacher,
  period).

"Holistic" is the hard requirement, and it has two halves:

1. **Every AI modality** — text LLM, multimodal LLM input (audio/image), STT,
   TTS, and future realtime / image-gen / embeddings — is captured at **both**
   institution and class grain.
2. **Coverage is enforced, not hoped for.** New models, new action kinds, and
   new features must be *unable* to make an unmetered AI call (§7). A metering
   system that depends on every future author remembering to wire it is not
   robust.

## 2. Direction

The earlier draft proposed a *separate* `ai_usage_events` ledger alongside
`ai_invocations`. Instead we **make `ai_invocations` itself the single universal
record for ALL AI calls** — text, speech, sessions, realtime — and build the
metering/limits layer directly on top of it. One table = "every AI call is
exactly one row." No dual-write, no cross-table reconciliation.

Three structural changes make this work:

1. **Extend `ai_invocations`** with modality-agnostic metrics (audio ms,
   characters, token-class breakdowns), a `usage_type` discriminator,
   denormalized `institution_id` + acting `user_id`, and snapshotted
   `cost_usd` / `credits` (§4).
2. **Decouple the always-on billing record from the debug payload.** Today the
   whole lifecycle is gated behind `AI_INVOCATION_LOGGING_ENABLED` (which also
   drives heavy GCS request/response uploads). We split these: the **row is
   always written** (it's now a system of record), while **GCS payload capture
   stays behind the flag** (debug/audit only). See §6.
3. **Close every funnel bypass and make new ones unbuildable** — restructure
   provider access as a capability-based AI gateway: metered handles,
   exclusive key custody, an import boundary, and runtime backstops, so an
   unmetered call is structurally impossible (§5, §7).

Everything downstream (counters, rates, limits, dashboards) reads from
`ai_invocations`.

## 3. What we have today — audited 2026-07-12

`ai_invocations` currently records **some text-generation LLM calls**, one row
per *provider attempt* (with `retry_of` / `retry_index` chaining). Columns of
note: `app_function_key`, `ai_provider`, `ai_model_id`, `ai_key_source`,
`class_id`, `assignment_id` (text), `submission_id` (text), `question_order`,
`attempt_number`, `prompt_tokens` / `completion_tokens` / `total_tokens`,
`duration_ms`, `status` (pending/completed/failed), `related_entity_type` /
`related_entity_id`, `request_storage_path` **(NOT NULL)** +
`response_storage_path` (GCS), `retry_of`, `retry_index`. Service-role only
(RLS enabled, no read policies). Gated entirely by
`AI_INVOCATION_LOGGING_ENABLED`.

### 3.1 Actual coverage by call site (verified against code)

| # | Call site | What it does | Logged today? |
| --- | --- | --- | --- |
| 1 | `generateStructured` + `invocation` param — rubric gen (×3 calls, `generate-rubric-and-answer/route.ts`), dynamic questions, evaluation (`evaluateSubmission.ts`) | text LLM | ✅ (flag-gated) |
| 2 | Multimodal turn route (`streamObject` via `chat-stream-object.ts`) — incl. **direct-audio input** (inline audio file part, live today) | text LLM (+ audio input) | ✅ (flag-gated) |
| 3 | **Transliteration** (`transliterateMessage.ts` → `generateStructured` **without** `invocation`) | text LLM | ❌ never logged |
| 4 | **Action handlers** — `mcq.ts`, `suggested-response.ts` call **`generateObject` directly**, bypassing `generateStructured`. Reached from the turn route (`dispatchAction`) *and* `/api/multimodal/action-retry`. (`display_content` makes no AI call.) | text LLM | ❌ never logged |
| 5 | `/api/multimodal/transcribe` — batch STT, chunked (Sarvam) and dual-language modes, internal `withRetry(…,3)` | STT | ❌ nothing |
| 6 | `/api/multimodal/tts` — SSE synth route (read-aloud / non-automatic speech; supports `contextId` continuations) | TTS | ❌ nothing |
| 7 | **Turn-route inline TTS** — automatic speech mode synthesizes *inside* `turn/route.ts` via three paths: Cartesia WS continuation session, Sarvam WS session, or chunked fallback `synthesizeStream`/`synthesize` | TTS | ❌ nothing — **missed by the previous plan** |
| 8 | `/api/pipecat/start` — legacy (retired) voice mode; delegates the whole STT+LLM+TTS pipeline to an **external Pipecat Cloud agent** using platform credentials | external session | ❌ invisible — **excluded from scope**; Pipecat is slated for deprecation (§5.5) |

So the previous plan's claim that "`generateStructured` covers … MCQ, …
suggested-response … new action kinds inherit this for free" was **wrong** —
the action layer never goes through it, and even inside the funnel the optional
`invocation` param lets call sites (transliteration) silently opt out. Both
defects get structural fixes, not just wiring (§5.3, §7).

### 3.2 Gap → fix summary

| Gap for holistic metering | Fix (this plan) |
| --- | --- |
| Speech records nothing; two text call sites bypass logging; inline turn TTS invisible. | Emission-site inventory §5 — every surface wired; bypasses structurally closed §7. |
| **Token-only metrics** — no audio-seconds, characters, session-seconds, or token-class breakdowns. | Add `audio_ms`, `characters`, `audio_output_ms`, `session_ms`, `token_details` (§4.1). |
| **`request_storage_path` NOT NULL** — speech/session rows have no GCS request payload. | Make nullable; set only when payload capture runs (§6). |
| **Gated by a debug flag** — metering must be always-on. | Split row (always-on) from payload upload (flagged) (§6). |
| **No institution scoping / no acting user / no RLS reads.** | Denormalize `institution_id`; add `user_id`; add three-tier read policies (§4.1, §4.3). |
| **No cost/price** — nothing maps raw units → money/credits. | `cost_usd`, `credits`, `rate_version` snapshots + versioned rate card (§4.4). |
| **Summing raw rows is too slow for a pre-flight quota gate.** | `ai_usage_counters` rollup (§4.5). |
| **Nothing stops the next feature from skipping all of this.** | Metered handles, import boundary, build-gated exhaustiveness script, unknown-model fail-safe (§7). |

Assets we already have and will lean on:

- **Model catalog** (`src/lib/ai/catalog/data.ts`, `types.ts`) classifies every
  model by `modelClass` / `tasks` / `io` inputs+outputs / provider /
  `apiModelId` — the backbone for `usage_type` and the rate card. Its
  `ModelTask` vocabulary (`text_generation`, `speech_to_text`,
  `text_to_speech`, `realtime_dialogue`, `audio_input`) and `Modality`
  (`text | image | video | audio`) already anticipate future capabilities.
- **Class-ownership + admin RLS helpers**: `is_class_owner`,
  `is_class_co_teacher`, `is_class_teacher_admin`, `is_class_institution_admin`,
  `is_institution_admin`, `is_platform_super_admin`.
- **`ai_key_source`** (`AiConfigSource`: `platform | institution | class | env`)
  distinguishes who bears provider cost — `platform`/`env` are platform-paid,
  `institution`/`class` are BYOK.
- **`related_entity_type` / `related_entity_id`** already exist on
  `ai_invocations` (used for chat messages) — reuse to link action rows to
  their action id.
- **`app_logs` + `logAppEvent`** — the institution-denormalization,
  service-role fire-and-forget, and RLS patterns to copy; also the sink for
  metering-write failures.

## 4. Schema changes

### 4.1 Extend `ai_invocations` (the universal record)

```sql
alter table public.ai_invocations
  -- modality discriminator (backfill existing rows to 'text_generation');
  -- vocabulary in §4.2 — kept open (text check, not enum) for future types
  add column usage_type text not null default 'text_generation',

  -- non-token metrics (null unless the modality applies)
  add column audio_ms         integer,   -- STT input duration
  add column characters       integer,   -- TTS input characters
  add column audio_output_ms  integer,   -- TTS/realtime synthesized audio duration
  add column session_ms       integer,   -- realtime session length
  add column metric_source    text,      -- 'provider' | 'measured' | 'estimated' (§5.1)

  -- token-class breakdown for multimodal / cached / reasoning pricing (§5.2) —
  -- one normalized jsonb bag, not a column per class (§4.1 note below):
  -- { cachedInputTokens?, reasoningTokens?, audioInputTokens?, imageInputTokens?, ... },
  -- shape enforced by a TS type at the application layer, not the DB schema
  add column token_details       jsonb,

  -- attribution
  add column institution_id  uuid references public.institutions(id) on delete set null,
  add column user_id         uuid references auth.users(id) on delete set null,

  -- billing snapshots (computed at write time from the rate card)
  add column cost_usd        numeric(14,8),   -- 8 dp: sub-micro-dollar per-row precision; backend-only (§4.4)
  add column credits         numeric(14,8),   -- exact, same precision as cost_usd — never rounded at write time (§4.4)
  add column rate_version    text,

  -- provider-side id (when returned) for invoice reconciliation
  add column provider_request_id text;

-- speech/session rows have no GCS request payload
alter table public.ai_invocations alter column request_storage_path drop not null;

-- backfill institution_id from class_id for existing rows
update public.ai_invocations i
  set institution_id = c.institution_id
  from public.classes c
  where i.class_id = c.id and i.institution_id is null;
```

Notes:

- **`user_id` (acting user) is added now** even though no current requirement
  needs it: per-student/per-teacher attribution **cannot be backfilled later**,
  and it unlocks future per-seat quotas, abuse detection, and per-student cost
  views for free. Same fail-safe principle as the raw token breakdowns.
- `cost_usd` at 8 decimal places because single small calls (a few hundred
  tokens on a cheap model) cost fractions of a micro-dollar; 6 dp would round
  individual rows by up to ~50%.
- `class_id` is already present and FK'd — **class-level attribution is
  essentially free** once `institution_id` is denormalized alongside it.
- **Why `token_details` is one jsonb column, not a column per token class
  (v12):** `cached_input_tokens`/`reasoning_tokens` were originally typed
  columns; they're folded into `token_details` because the earlier
  justification didn't survive scrutiny — cost computation reads the raw
  provider `usage` object once, at write time, and never reads a persisted
  column back, so a typed column buys nothing there; §8.1 has no "by token
  class" dashboard cut to make aggregation ergonomics matter today; and the
  original stated reason (§5.2: "raw metrics can never be recovered
  retroactively, so backfill is trivial if we kept them") is identical to
  `token_details`'s own justification, so there was no principled reason to
  split some token-class breakdowns out and leave the rest (audio/image/video
  per-modality counts) in jsonb. Shape is enforced by a TS type in
  `computeUsage.ts`, not the SQL schema; promote a key to a real column only
  if a specific one becomes a genuinely hot, indexed-lookup-worthy query —
  an expression index (`(token_details->>'reasoningTokens')::bigint`) covers
  that need without a migration.
- **Why `audio_ms`/`characters`/`audio_output_ms` stay separate typed columns
  instead of also folding into `token_details` (v12):** unlike the token
  classes above, these are **live, currently-billed** inputs for `live`
  usage_types (`speech_to_text`, `text_to_speech` — §4.2), not speculative
  future pricing — `computeUsage` and the rate card key off them today. They
  also can't collapse into a single generic `(metric_value, metric_type)`
  pair the way a jsonb bag can: **TTS already needs `characters` *and*
  `audio_output_ms` on the same row simultaneously** (§5.1), so a
  one-metric-per-row design would either violate "one row per AI call" (§2)
  or require a real one-to-many child table — disproportionate machinery for
  a metric set that's small and structurally bounded (one column roughly per
  usage_type, and usage_types are a controlled vocabulary gated by the §7.3
  exhaustiveness script, unlike token classes which can proliferate per
  provider *within* a single usage_type). `session_ms` (realtime, not yet
  live) stays a column too for the same reason it's a small, bounded,
  already-reserved set — there is no proliferation risk here to design
  against.

New indexes for aggregation / limit reads:

```sql
create index ai_invocations_inst_time_idx
  on public.ai_invocations (institution_id, started_at desc) where institution_id is not null;
create index ai_invocations_inst_type_time_idx
  on public.ai_invocations (institution_id, usage_type, started_at desc) where institution_id is not null;
create index ai_invocations_class_time_idx
  on public.ai_invocations (class_id, started_at desc) where class_id is not null;
```

### 4.2 `usage_type` vocabulary — extensible, catalog-aligned

Derived from the catalog's `ModelTask` plus session/legacy types. Kept as a
`text` column with an app-level registry (like the activity-type registry
pattern) rather than a DB enum, so adding a type is a code change, not a
migration:

| usage_type | Billable metric(s) | Status |
| --- | --- | --- |
| `text_generation` | input/output tokens (+ cached, reasoning, per-modality classes) | live |
| `speech_to_text` | `audio_ms` (or provider tokens for token-billed STT) | live |
| `text_to_speech` | `characters` (+ `audio_output_ms`) | live |
| `realtime_dialogue` | `session_ms` + provider token usage (Live API bills tokens, incl. audio tokens) | reserved (gemini-live coming_soon) |
| `image_generation` | `images` count / output tokens | reserved (dispatcher already stubs an image action kind) |
| `video_generation` | `video_seconds` | reserved (`Modality` already includes video) |
| `embedding` | input tokens | reserved |

Two alignment rules keep this future-proof:

- **`audio_input` is a capability, not a usage_type.** A turn that feeds
  learner audio straight into the LLM is still one `text_generation` row; the
  audio shows up in its (per-modality) token counts (§5.2).
- **Every new `ModelTask` added to the catalog must map to a usage_type + rate
  metric** — enforced by the build-gated §7.3 script, so a new modality
  cannot ship half-metered.

Speech/realtime rows reuse `status` (`pending`/`completed`/`failed`): insert
`pending` at operation start (background, non-blocking), flip to `completed`
with metrics when the stream/session closes — mirroring
`scheduleAiInvocationStart` → `completeAiInvocation`. A client abort still
finalizes the row with whatever was actually consumed (it was real provider
cost).

### 4.3 RLS: expose reads at three levels

Keep **all writes service-role only** (as today). Add SELECT policies so
dashboards work without a separate table:

```sql
create policy "Usage readable by admins and class teachers" on public.ai_invocations
  for select using (
    public.is_platform_super_admin()
    or (institution_id is not null and public.is_institution_admin(institution_id))
    or (class_id is not null and public.is_class_teacher_admin(class_id))
  );
```

- Super admin → all rows.
- Institution admin → their institution.
- Class teacher/co-teacher → their class (class-level visibility for teachers).

(Note: rows carry GCS *paths* + token counts but not prompt *content*, so
exposing the row to class teachers does not leak transcripts. If that's still
too much, expose dashboards through a `security definer` aggregate view instead
and keep the base table service-only — adopted default is the row policy;
see §10 #2.)

### 4.4 `ai_usage_rates` — pricing / rate card (versioned)

Maps `(provider, model, usage_type, metric)` → a USD rate, effective-dated.
Start as **typed TS config** (`src/lib/ai/metering/rates.ts`, keyed off the
catalog, versioned by a `RATE_VERSION` constant) — fast, testable,
colocated — and migrate to a DB table only when finance needs runtime edits.

```
metric ∈ 'input_token' | 'output_token'
       | 'cached_input_token' | 'reasoning_token'
       | 'audio_input_token' | 'image_input_token'      -- per-modality token classes
       | 'audio_second' | 'audio_output_second'
       | 'character' | 'session_second'
       | 'image' | 'video_second' | 'request'           -- reserved for future types

rate = {
  usdPerUnit: number,  -- $ per single raw unit; drives cost_usd (§4.1), full precision
}

// one global constant, versioned alongside RATE_VERSION — not per rate entry
CREDITS_PER_USD: number
```

`cost_usd` and `credits` still serve different audiences — `cost_usd` is the
backend-only ledger (finance reconciliation, §7.5), `credits` is what
institutions allocate, cap, and see burn down — but `credits` is now a
**deliberate, exact linear function of `cost_usd`**, not an independently
tuned per-modality value: `credits = cost_usd × CREDITS_PER_USD`, computed to
the same full precision as `cost_usd` (`numeric(14,8)`) and **never rounded
at write time**. This guarantees a credit means the same real-dollar amount
regardless of which modality it was spent on — the fungibility property a
"currency" needs, which an earlier draft of this plan broke by tuning a
`creditUnitSize` independently per modality (whole numbers looked clean
per-call, but a voice-minute credit and a text-token credit ended up worth
20× different amounts of real cost).

**Never round or floor before storing.** It's tempting to round per-row for
a "clean" ledger, but rounding compounds: summed across thousands of calls in
a counter (§4.5), even a tiny per-row bias becomes a real drift between what's
metered and what's actually consumed — and a per-call minimum floor
(previously: "every call costs at least 1 credit") turns into a large
relative overcharge on cheap calls. Since `credits` is stored exact, neither
problem exists: a nonzero `cost_usd` always produces a correctly-proportioned
nonzero `credits`, `ai_usage_counters` sums are exact, and `assertWithinQuota`
(§8) compares the exact value. **Rounding is purely a display concern** — a
UI formats `credits` to however many decimals read best on that screen (a
teacher's simple usage meter vs. an admin's detailed invoice can round
differently) without touching what's actually metered, capped, or summed.

`CREDITS_PER_USD` is the one knob that sets what a credit is worth and how
big typical balances feel — e.g. `CREDITS_PER_USD = 1000` (1 credit =
$0.001) makes a $0.0095 turn cost exactly 9.5 credits. It's a v1 placeholder
pending finance sign-off, same as any rate, and because credits are now a
pure rescaling of cost rather than per-modality blocks, tuning it later is a
one-constant edit, not a per-metric one.

**This is also why `credits` stays a distinct stored field instead of being
derived on-the-fly from `cost_usd` at read time** — it's what keeps the door
open for `credits` to eventually mean something other than "USD × a
constant" (margin, promotional pricing, or decoupling a credit's value from
any single currency entirely — the local-currency work deferred in §10) as a
future `RATE_VERSION`, without touching how credits are consumed, capped,
read, or displayed anywhere downstream. `cost_usd` stays the USD-pinned
backend truth regardless; `credits` is the layer that's free to evolve.

Resolution rules (this is what makes "all models" tractable):

1. **Fallback chain within a model:** if a fine-grained metric rate is absent
   (e.g. `audio_input_token`), fall back to the blended `input_token` /
   `output_token` rate. v1 can ship with blended rates only; refinement is
   additive, no schema change.
2. **Every catalog model must appear** — including `coming_soon` entries
   (gemini-2.5-pro, gemini-live, google STT/TTS, whisper-1) — either with real
   rates or an explicit `unpriced: true` marker. The build-gated §7.3 script
   enforces exhaustiveness, so activating a model can never outrun its
   pricing.
3. **Unknown at runtime** (e.g. a provider aliases a model id): never block
   the user call — write the row with `cost_usd`/`credits` **null**, emit
   `logAppEvent({ level:'warn', source:'usage_metering', event:'missing_rate' })`,
   and let the nightly reconcile (§9 Phase 2) surface null-cost rows for
   backfill. Raw metrics are always captured, so repricing is a pure UPDATE.
4. **Repricing = new `RATE_VERSION`.** The write path snapshots `cost_usd` +
   `credits` + `rate_version` onto the row, so historical bills never change.
   Tuning `CREDITS_PER_USD` (product/UX, one constant) and per-metric
   `usdPerUnit` (cost tracking) are independent edits, each a new rate
   version. (If we ever bill from a provider's non-USD price list — e.g.
   Sarvam quotes INR — convert to USD inside the rate card at a pinned FX
   rate and note it in the rate entry; `cost_usd` stays single-currency.)
5. **Service tiers are a rate dimension, not a schema change.** If we later use
   batch/priority tiers, key the rate on `(model, metric, tier)` with tier
   defaulting to `standard`.
6. **Platform vs. BYOK pricing, if it ever diverges, is also just a rate
   version.** v1 uses one shared `CREDITS_PER_USD` for both key owners (§4.5,
   §4.6) — there's no special-case code branching on `key_owner` anywhere in
   `computeUsage`. If a future rate version wants platform-paid credits to
   carry margin that BYOK shouldn't, it's expressed as a key-owner-scoped
   exchange rate (or a key-owner-scoped `usdPerUnit` override) resolved the
   same way any other rate is — a new `RATE_VERSION`, not a new mechanism.

### 4.5 `ai_usage_counters` — period-bucketed usage analytics

Summing `ai_invocations` on every dashboard read is too slow. Maintain
incrementally-updated rollups keyed to **both** grains in one table. **As of
v10, this table is analytics-only** — it powers the §8.1 distribution views
(by modality, by key owner, by period) and is no longer what enforcement reads.
Enforcement now reads a running balance (§4.6) that isn't period-bucketed at
all, because a wallet's balance has to persist and roll over *across*
periods, which a table keyed on `period_start` structurally can't represent.
This table still matters — "how many credits did Spanish 101 spend on
speech-to-text in July" is a real, distinct question from "how many credits
does Spanish 101 have left right now," and only this table answers the
first one cheaply.

> **Fix from v2:** the previous draft put a *nullable* `class_id` in the
> primary key. Postgres primary keys force NOT NULL, so that design is
> invalid. Use a **zero-UUID sentinel** for the institution-wide rollup
> instead — it keys cleanly in the PK and in `ON CONFLICT`.

```sql
create table public.ai_usage_counters (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  -- '00000000-0000-0000-0000-000000000000' = institution-wide rollup (no class FK on sentinel)
  class_id       uuid not null default '00000000-0000-0000-0000-000000000000',
  -- whose credentials served the calls in this bucket — the platform's own
  -- keys vs an institution/class's own (BYOK). Derived once, at write time,
  -- from the row's ai_key_source (platform/env -> 'platform', institution/class -> 'byok').
  key_owner      text not null,
  period_start   date not null,          -- billing bucket (e.g. month start)
  usage_type     text not null,          -- or 'all' for a cross-modality total
  credits        numeric(20,8) not null default 0,   -- exact running sum (§4.4) — never rounded, so no drift over many rows
  events         bigint not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (institution_id, class_id, key_owner, period_start, usage_type)
);
```

No `cost_usd` here — deliberately. Counters exist for exactly one job, fast
credits enforcement (+ the modality/key-owner cuts in §8.1), and nothing reads a
rolled-up dollar figure at that grain: enforcement only ever compares
`credits` (§8), and the finance-facing cost view aggregates `ai_invocations`
directly instead (a periodic, not hot-path, operation — see §4.4's split
between `cost_usd` as a backend ledger and `credits` as the product unit).
Keeping `cost_usd` out of the counter isn't a loss of any capability, just
one less column incremented on every write.

(`class_id` deliberately has **no FK** so the sentinel row is legal; real class
ids are validated upstream by the `ai_invocations` FK. A trigger-checked FK is
overkill for a rebuildable cache.)

On each event, a `record_usage_counter(...)` SQL function upserts four rows —
`(inst, class, usage_type)`, `(inst, class, 'all')`, `(inst, SENTINEL,
usage_type)`, `(inst, SENTINEL, 'all')` — atomically:

```sql
create or replace function public.record_usage_counter(
  p_institution_id uuid,
  p_class_id uuid,          -- may be null (institution-scope work)
  p_key_owner text,         -- 'platform' | 'byok'
  p_period_start date,
  p_usage_type text,
  p_credits numeric
) returns void
language sql security definer set search_path = public as $$
  insert into public.ai_usage_counters as c
    (institution_id, class_id, key_owner, period_start, usage_type, credits, events)
  select distinct  -- distinct: when p_class_id is null the class rows collapse into the sentinel rows
    p_institution_id, v.cid, p_key_owner, p_period_start, v.ut, p_credits, 1
  from (values
    (coalesce(p_class_id, '00000000-0000-0000-0000-000000000000'::uuid), p_usage_type),
    (coalesce(p_class_id, '00000000-0000-0000-0000-000000000000'::uuid), 'all'),
    ('00000000-0000-0000-0000-000000000000'::uuid, p_usage_type),
    ('00000000-0000-0000-0000-000000000000'::uuid, 'all')
  ) as v(cid, ut)
  on conflict (institution_id, class_id, key_owner, period_start, usage_type)
  do update set
    credits    = c.credits + excluded.credits,
    events     = c.events + excluded.events,
    updated_at = now();
$$;
-- service-role only: revoke execute from anon, authenticated
```

**Every row hits the counters, tagged by `key_owner`.** BYOK rows roll up under
`key_owner='byok'` — a fully separate bucket from `key_owner='platform'` — so the
platform-vs-BYOK analytics split (§8.1) is always available, even though
(as of v10) capping BYOK spend happens through a wallet (§4.6), not this
table. `key_owner` is derived once, at write time, from the row's
`ai_key_source` — the same resolution the gateway already does for
`keySource` (§7.1). Counters are a pure cache of `ai_invocations` →
**rebuildable** by re-aggregating the base table (nightly reconcile, §9).

- **Institution total for a key owner** (O(1) analytics read): `(inst, SENTINEL, key_owner, 'all')`.
- **Class total for a key owner**: `(inst, class, key_owner, 'all')`.
- **Combined spend across both key owners**: sum the `platform` and `byok` rows —
  two indexed PK lookups, still O(1).
- Per-modality drill-downs come from the `usage_type` rows.

### 4.6 Credit wallets — recurring grants, top-ups, and balance-based enforcement

`ai_usage_limits` (a static cap compared against a period-scoped counter) is
**replaced** as of v10. It couldn't represent what institutions actually
need: credits that accumulate month to month (capped or not), and top-ups a
class owner can buy on demand when they run out mid-period. Neither
"accumulate" nor "buy more right now" fits a table that resets its
comparison basis at every `period_start` — so enforcement moves to a real
**balance**, funded by two independent kinds of credit-in events (a
recurring grant, a manual top-up) and drained by usage. This mirrors how
production usage-based platforms (e.g. Cartesia's own credit system — a
monthly allotment, a bounded rollover, and separate overage/top-up handling)
structure the same problem.

Three tables, cleanly separated by responsibility — **policy**, **ledger**,
**current balance**:

```sql
-- Policy: how this scope+key_owner gets funded, and what enforcement does about it.
create table public.ai_credit_wallets (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  class_id       uuid references public.classes(id) on delete cascade,  -- null = whole institution
  key_owner      text not null default 'platform',  -- 'platform' | 'byok'
  -- credits auto-added each period; NULL = no recurring renewal (pure top-up wallet) —
  -- not 0, which would mean "a real recurring grant of zero credits"
  monthly_grant  numeric(14,4),
  -- caps what carries over into a new grant; NULL = unbounded rollover; 0 = use-it-or-lose-it
  max_balance    numeric(14,4),
  soft_warn_threshold numeric(14,4),  -- warn when balance drops below this
  enforcement    text not null default 'off',       -- 'off' | 'warn' | 'block'
  updated_at     timestamptz not null default now(),
  unique (institution_id, class_id, key_owner)
);

-- Ledger: append-only, credit-IN events only (grants + top-ups + manual adjustments).
-- Debits aren't mirrored here — ai_invocations.credits is already that exhaustive log.
create table public.ai_credit_transactions (
  id           uuid primary key default gen_random_uuid(),
  wallet_id    uuid not null references public.ai_credit_wallets(id) on delete cascade,
  type         text not null,             -- 'monthly_grant' | 'topup' | 'adjustment'
  credits      numeric(14,8) not null,    -- always positive
  period_start date,                      -- set on 'monthly_grant' rows; null otherwise
  created_by   uuid references auth.users(id) on delete set null,  -- null for system-generated grants
  note         text,                      -- payment reference / adjustment reason
  created_at   timestamptz not null default now()
);
create index ai_credit_transactions_wallet_time_idx
  on public.ai_credit_transactions (wallet_id, created_at desc);

-- Current balance: the one number assertWithinQuota actually reads. Not period-bucketed —
-- a balance has to persist and roll over *across* periods, which a period_start key can't do.
create table public.ai_credit_balances (
  wallet_id  uuid primary key references public.ai_credit_wallets(id) on delete cascade,
  balance    numeric(14,8) not null default 0,
  updated_at timestamptz not null default now()
);
```

Three service-role-only functions move credits (writes throughout this
section: `revoke execute from anon, authenticated`):

```sql
-- Scheduled monthly job (a cron, §9 Phase 3) calls this once per wallet
-- where monthly_grant is not null — pure top-up wallets are never touched by it.
create or replace function public.grant_monthly_credits(
  p_wallet_id uuid, p_period_start date
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_grant numeric(14,4);
  v_max   numeric(14,4);
begin
  select monthly_grant, max_balance into v_grant, v_max
  from public.ai_credit_wallets where id = p_wallet_id;

  if v_grant is null then
    return;
  end if;

  -- Clamp existing balance to max_balance BEFORE granting — this forfeits only
  -- unused rollover, never touches the fresh grant landing on top of it.
  if v_max is not null then
    update public.ai_credit_balances
      set balance = least(balance, v_max)
      where wallet_id = p_wallet_id;
  end if;

  insert into public.ai_credit_transactions (wallet_id, type, credits, period_start)
  values (p_wallet_id, 'monthly_grant', v_grant, p_period_start);

  insert into public.ai_credit_balances (wallet_id, balance)
  values (p_wallet_id, v_grant)
  on conflict (wallet_id) do update
    set balance = ai_credit_balances.balance + excluded.balance,
        updated_at = now();
end;
$$;

-- Called from the purchase flow once payment clears (payment itself is out of
-- scope for this plan — no billing provider exists in this codebase today).
create or replace function public.record_topup(
  p_wallet_id uuid, p_credits numeric, p_created_by uuid, p_note text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.ai_credit_transactions (wallet_id, type, credits, created_by, note)
  values (p_wallet_id, 'topup', p_credits, p_created_by, p_note);

  insert into public.ai_credit_balances (wallet_id, balance)
  values (p_wallet_id, p_credits)
  on conflict (wallet_id) do update
    set balance = ai_credit_balances.balance + excluded.balance,
        updated_at = now();
end;
$$;

-- Called from completeAiInvocation, alongside record_usage_counter (§4.5, §5).
create or replace function public.debit_wallet_balance(
  p_wallet_id uuid, p_credits numeric
) returns void
language sql security definer set search_path = public as $$
  update public.ai_credit_balances
    set balance = balance - p_credits,
        updated_at = now()
    where wallet_id = p_wallet_id;
$$;
```

**The rollover formula, worked through:** `max_balance` bounds only what
survives into a new grant, applied *before* that grant lands, so this
period's fresh allowance is always honored in full even if it briefly pushes
the balance above `max_balance`:

| `max_balance` | Behavior | Balance was 4,200, `monthly_grant = 2,000` |
| --- | --- | --- |
| `0` | Use-it-or-lose-it — today's old "resets every period" behavior, as a special case, not a separate code path. | Forfeits 4,200 → new balance = **2,000**. |
| `5,000` | Accumulates, capped. | Clamped to 5,000 first → new balance = **7,000**. |
| `null` | Unbounded accumulation. | Nothing forfeited → new balance = **6,200**. |

**Top-ups are never clamped by `max_balance` — that's deliberate, not an
oversight.** A recurring grant is free credits the platform is giving away;
forfeiting unused ones at a cap is completely standard (it's what Cartesia's
own rollover-with-a-limit does). A top-up is **money already paid** —
silently clamping a purchase down means the customer paid for credits they
didn't receive, which is a billing-correctness bug, not a usage policy. If a
wallet needs a hard ceiling that also bounds top-ups, that check belongs
**before the purchase completes** (reject or warn in the purchase flow:
"this would exceed your cap, buy less"), never as a post-hoc clamp on
money already collected.

**One schema serves three funding patterns**, with no special-casing beyond
one `where monthly_grant is not null` clause in the grant job:

- **Recurring only** (today's model, generalized): `monthly_grant` set,
  `max_balance = 0` (or a real cap).
- **Top-up only, on demand**: `monthly_grant = null` — the scheduled job
  skips this wallet entirely; the balance only ever moves via
  `record_topup` and usage debits.
- **Hybrid**: `monthly_grant` set (recurring baseline) *and* `record_topup`
  called whenever the class owner buys more — exactly the Spanish 101 case
  (§8 walkthrough): base monthly allocation, topped up 2,000 credits
  mid-period when they ran out early.

Wallet resolution is unchanged from the old limits model: **most specific
`(scope, key_owner)`** — class wallet if one exists, else the institution
wallet, same key_owner. `enforcement` still defaults `'off'` on every wallet —
nothing is capped until an admin opts in. Every previous BYOK-specific
reasoning still applies: v1 shares one `CREDITS_PER_USD` for both key owners
(§4.4), so a wallet's balance means the same real-dollar amount regardless
of `key_owner`; there's no special-cased markup protection to build because
there's no markup yet.

RLS on all three tables mirrors §4.3's three-tier pattern (writes
service-role only; reads: super admin → all, institution admin → their
institution's wallets/balances/transactions, class teacher/co-teacher →
their own class's) — an institution admin or class owner can see their
wallet's balance and transaction history (including "$X top-up on July 28")
without a service-role query.

*(A local-currency FX boundary — `institutions.billing_currency`,
`fx_rates`, per-limit input snapshots — was drafted here in v6 and cut in v7
to keep this version credits-only. See the deferral note at the end of §10
if this gets revisited — nothing about the wallet model precludes it later,
since `credits` stays the unit throughout.)*

## 5. The write path — emission-site inventory

Fold metering into the **existing invocation lifecycle** (`startAiInvocation` /
`scheduleAiInvocationStart` / `completeAiInvocation` / `failAiInvocation`).
`completeAiInvocation` gains the job of:

1. Resolving `institution_id` from `class_id` (export `resolveInstitutionId`
   from `appLog.ts` — it exists there but is module-private today) and
   carrying `user_id` from the request auth context.
2. Resolving the rate for `(provider, model, usage_type, metric)` at
   `RATE_VERSION` (fallback chain §4.4).
3. Computing + writing `cost_usd`, `credits`, `rate_version` onto the row (in
   the same `update` that writes metrics).
4. Calling `record_usage_counter(...)` (the four atomic upserts, scoped to
   the row's `key_owner` — §4.5, analytics only as of v10).
5. Calling `debit_wallet_balance(wallet_id, credits)` (§4.6) — `wallet_id`
   was already resolved once, at handle-resolution time, by
   `assertWithinQuota` (§8), and carried on the handle/context, so this is a
   single indexed `UPDATE` with no second lookup.

6. On failure of any metering step, `logAppEvent({ level:'error',
   source:'usage_metering' })` so drops are visible.

All non-blocking (detached), so it never delays time-to-first-token or a
response.

### 5.0 The inventory — eight surfaces, each with its work item

| # | Surface | usage_type | Metrics | Work required |
| --- | --- | --- | --- | --- |
| 1 | `generateStructured` (rubric gen, dynamic questions, evaluation, transliteration, **and — after §5.3 — all action handlers**) | `text_generation` | tokens + breakdowns | Resolve models as gateway handles (§7.1) — invocation context is bound at resolution and cannot be omitted. The transliterate route already resolves `classDbId` via `getClassDbIdForAssignment`, so its context is at hand. |
| 2 | Multimodal turn route (`streamObject`) — incl. **direct-audio input, which is live today** (`latestUserAudio` → inline audio file part when the model supports `audio_input`) | `text_generation` | tokens from the usage promise + `providerMetadata` breakdowns (§5.2) | Add metering fields to the existing `scheduleAiInvocationStart`/complete flow. |
| 3 | **Action layer** (`mcq`, `suggested_response`, future kinds) via `dispatchAction` — reached from the turn route *and* `/api/multimodal/action-retry` | `text_generation` | tokens | Migrate handlers off raw `generateObject` onto `generateStructured` (§5.3). Covers both entry points and all future kinds at once. |
| 4 | `/api/multimodal/transcribe` | `speech_to_text` | `audio_ms` (provider-reported where available, §5.1; else measured) | **One row per `stt.transcribe` call.** Dual-language = 2 calls on the same audio = 2 rows (both real cost). Chunked Sarvam = one row per chunk. Plumb class/submission context (below). |
| 5 | `/api/multimodal/tts` (SSE synth route) | `text_to_speech` | `characters = text.trim().length` + `audio_output_ms` from streamed bytes ÷ (sampleRate × bytesPerSample) | One row per POST. Continuation calls (`contextId`/`continueGeneration`) each carry only their own chunk's characters, so per-call rows sum correctly. Plumb context. |
| 6 | **Turn-route inline TTS** (automatic speech mode) — Cartesia WS continuation session / Sarvam WS session / chunked fallback synth | `text_to_speech` | `characters` = sum of speech deltas actually pushed to TTS (never the full reply — `noSpeech` and `suppressAutoTts` turns push none); `audio_output_ms` from the audio-pump byte total | **One logical row per turn** (a WS session is one continuous synth; the fallback path's N chunk-calls also roll up to the turn). Insert `pending` when the TTS session opens; finalize on `speech_end`/abort with whatever was consumed. Link to the same turn context (`related_entity_id` = chat message id). |
| 7 | **Legacy voice (`/api/pipecat/start`)** | — | — | **Excluded** — Pipecat is slated for deprecation; no metering work (§5.5). |
| 8 | Realtime (gemini-live, future) | `realtime_dialogue` | `session_ms` **and** provider token usage (the Live API bills tokens, including audio tokens — capture both) | Emit on session close; heartbeat partial updates for long sessions so a crash can't lose the whole session. |

**Context plumbing for STT/TTS (surfaces 4–5):** these routes currently
receive only `assignmentId`. Resolve `class_id` **server-side from the
assignment** (`getClassDbIdForAssignment` is already imported by the
action-retry route; it's cached) rather than trusting client-supplied ids;
accept `submissionId` from the client for correlation only. `provider` /
`apiModelId` come from the catalog entry the routes already resolve.
`ai_key_source` needs a small extension: `resolveProviderApiKeyForAssignment`
returns only `string | null` today, so the gateway (which absorbs it, §7.2)
extends the underlying `getProviderApiKey` to also report **which scope
supplied the key** (class/institution → BYOK; platform/env → platform-paid).

**Retries:** text logs each provider attempt (provider-cost accurate).
STT/TTS use an *internal* `withRetry(…, 3)` not surfaced as separate rows —
v1 logs **one row per logical operation**; per-attempt speech rows are a noted
later refinement. `retry_index > 0` rows can be **excluded from customer
credits** while still counting toward `cost_usd` (policy flag; columns ready).

### 5.1 Provider usage capture — verified against official docs (2026-07-12)

For **text**, the AI SDK normalizes provider `usage` (tokens) onto the result —
authoritative, already captured. For **speech**, the picture is
provider-specific. **The current wrappers (`speech/types.ts`:
`TranscribeResult = { text }`, `SynthesizeResult = { audio, mimeType }`)
discard everything else — this is what we extend.**

#### STT — capture provider-reported metrics; the response *does* carry them (except Sarvam)

| Provider (model) | Response carries | Billing basis | Capture strategy | `metric_source` |
| --- | --- | --- | --- | --- |
| **OpenAI** `gpt-4o-mini-transcribe` | **`usage` object** — `type:"tokens"` with `input_tokens`, `input_token_details.{audio_tokens,text_tokens}`, `output_tokens`, `total_tokens`. (`whisper-1`, catalog `coming_soon`, instead returns `type:"duration"` `{seconds}` — the wrapper must handle both shapes.) | Token-based (mini/4o-transcribe); duration-based (whisper-1). | Pass `result.usage` verbatim into `TranscribeResult.usage.raw`; map tokens → normalized, or `seconds` → `audio_ms`. | `provider` |
| **Cartesia** `ink-whisper` | `text`, `request_id`, `language`, **`duration` (audio seconds)**, optional `words[]`. | Per audio-minute (1 credit/sec of audio). | Parse `body.duration` → `audio_ms`; keep `request_id` → `provider_request_id`. | `provider` |
| **Sarvam** `saaras:v3` | `request_id`, `transcript`, `language_code`, optional `timestamps`. **No duration, no usage.** | ₹30 / hour of audio. | **Self-measure.** Best: request `timestamps` and take the last word's `end`; else fall back to client `recordingDurationMs`; server-side decode later if drift matters. | `measured` |

#### TTS — no provider returns usage in the response; measure at the call site

Verified: **OpenAI, Cartesia, and Sarvam all return only audio** (byte stream /
base64 / WS chunks) with no usage object. The route (or turn-route TTS block)
computes the billable metric from inputs/outputs:

| Provider (model) | Billing basis (verified) | Metric we record |
| --- | --- | --- |
| **OpenAI** `gpt-4o-mini-tts` | **Token-based** — text input tokens ($0.60/1M) + audio output tokens ($12/1M), *not* characters. | `characters` (input proxy) + `audio_output_ms` (output proxy). `metric_source='measured'`; flagged **approximation**, reconciled against OpenAI's invoice. |
| **Cartesia** `sonic-3.5` (batch + WS continuation sessions) | 1 credit / character. | `characters` — exact (batch: request text; WS: sum of transcript pushes). |
| **Sarvam** `bulbul:v3` (batch + WS sessions) | Per character. | `characters` — exact (same). |

Because every TTS call site already holds the input text and observes the
output byte stream, **TTS needs no wrapper change** — it is measured where it
runs. `audio_output_ms = bytes ÷ (sampleRate × bytesPerSample)` is exact for
the raw-PCM providers (Cartesia/Sarvam; sample rate comes from
`tts.streamFormat`).

#### Concrete changes

1. **`speech/types.ts`** — add a shared usage shape and thread it through STT:

   ```ts
   export interface SpeechUsage {
     audioMs?: number | null;          // STT input duration
     characters?: number | null;       // TTS input chars
     providerTokens?: { input?: number; output?: number; audio?: number } | null;
     source: "provider" | "measured" | "estimated";  // → row.metric_source
     providerRequestId?: string | null;              // → row.provider_request_id
     raw?: unknown;                     // provider usage/duration blob, for reconciliation
   }
   export interface TranscribeResult { text: string; usage?: SpeechUsage }
   // SynthesizeResult unchanged; TTS usage is computed at the call site.
   ```

2. **STT wrappers** — populate `usage`: `openai/stt.ts` forwards
   `result.usage` (both token and duration shapes); `cartesia/stt.ts` parses
   `body.duration`; `sarvam/stt.ts` optionally requests `timestamps` and
   derives `audioMs`, else leaves `usage` undefined so the route self-measures.
   (Future streaming STT — the catalog already reserves
   `sttDelivery: "stream"` — meters audio seconds pushed over the socket, same
   column, `metric_source='measured'`.)

3. **transcribe route** — record `usage.audioMs` when supplied, else a measured
   duration (prefer server-derived from the audio buffer over the spoofable
   client `recordingDurationMs`); set `metric_source` accordingly.

4. **tts route + turn-route TTS block** — compute `characters` and
   `audio_output_ms` per §5.0 rows 5–6.

**Sources:** OpenAI [Create transcription](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)
+ [gpt-4o-mini-tts model/pricing](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts);
Cartesia [Batch STT](https://docs.cartesia.ai/api-reference/stt/transcribe)
+ [pricing](https://docs.cartesia.ai/pricing);
Sarvam [STT REST](https://docs.sarvam.ai/api-reference-docs/speech-to-text/transcribe)
+ [pricing](https://www.sarvam.ai/api-pricing). Verified 2026-07-12.

### 5.2 Multimodal LLM usage — audio/image/video input, cached & reasoning tokens

"Multimodal LLM" here means a **single generative call that ingests non-text
input**. This is **not hypothetical**: the turn route's direct-audio mode ships
today — when the chat model supports the `audio_input` task
(`gemini-3-flash-preview`), the learner's raw audio is sent as an inline file
part on the same `streamObject` call. Image-capable models (`gpt-5.4`,
`gpt-4o`, `gemini-2.5-pro-preview`) are catalog-declared (`io.inputs` includes
`image`); no feature sends images yet, but the moment one does, the same
mechanics apply with zero metering changes. `Modality` already reserves
`video`.

**Coverage is automatic.** A multimodal call is still one `text_generation`
invocation, and providers **fold non-text input into the token counts** — the
`inputTokens` / `outputTokens` we capture already include it. No new emission
site, no new `usage_type`.

**The catch: modalities and token classes are priced differently**, so a single
blended per-input-token rate mis-prices multimodal-heavy calls. Verified
against the Gemini API, `usageMetadata` breaks a call's tokens into:

- `promptTokensDetails` / `candidatesTokensDetails` — per-modality
  `ModalityTokenCount` (TEXT / IMAGE / AUDIO / VIDEO). Audio/image input tokens
  are priced above text tokens.
- `cachedContentTokenCount` (+ `cacheTokensDetails`) — cached input, ~75%
  cheaper.
- `thoughtsTokenCount` — reasoning/thinking tokens, billed as output. Material
  because the app drives Gemini `thinkingLevel` and OpenAI reasoning effort per
  function binding.

OpenAI mirrors this with `usage.input_tokens_details` /
`output_tokens_details` (`cached_tokens`, `audio_tokens`, `reasoning_tokens`).
The AI SDK surfaces the cross-provider ones on `usage` (`reasoningTokens`,
`cachedInputTokens`) and the full per-modality breakdown under
`providerMetadata` (Google `usageMetadata`).

**Recommendation — capture the breakdown now, price blended now.**

1. **Store the raw breakdown from day one** (`token_details` — §4.1) even
   while billing at a blended rate: raw metrics can never be recovered
   retroactively; a reprice/backfill
   is trivial if we kept them.
2. **Rate card refines additively** via the per-token-class metrics
   (`audio_input_token`, `image_input_token`, `cached_input_token`,
   `reasoning_token`) with blended fallback (§4.4 rule 1).
3. **Wiring:** in `structured.ts` and the turn route, read `providerMetadata`
   alongside `result.usage` and normalize into the columns. This is the *only*
   net-new capture work for multimodal LLM input.

**Output modalities:** all text today. When an image-generation action ships
(the dispatcher already stubs `case "image"`), it gets `usage_type
'image_generation'` + an `images`/output-token metric — vocabulary and rate
metrics already reserved (§4.2, §4.4). Gemini Live audio-out is metered as
`realtime_dialogue` (session + tokens), already reserved.

**Sources:** Gemini [ModalityTokenCount](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/v1/ModalityTokenCount)
+ [GenerateContentResponse.UsageMetadata](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1/GenerateContentResponse)
+ [Counting tokens](https://ai.google.dev/api/tokens); Vercel AI SDK
[Google provider](https://ai-sdk.dev/v5/providers/ai-sdk-providers/google-generative-ai).
Verified 2026-07-12.

### 5.3 Action layer — migrate off raw `generateObject`

`mcq.ts` and `suggested-response.ts` call the AI SDK's `generateObject`
directly, so they are invisible to invocation logging *and* they use an API
that is deprecated in AI SDK v6 (`structured.ts` already documents the
replacement). Migrate both handlers to `generateStructured`:

- **Model plumbing:** `resolveActionModel` currently returns only
  `{ model, providerOptions }`, discarding the resolved config's
  provider/modelId/keySource. Under §7.1 it instead returns a **metered
  handle** bound to the action's registry `appFunctionKey` (e.g.
  `text.mcq_generation`) and the turn's context, threaded through
  `DispatchActionArgs`. Handlers call `handle.generateStructured(...)` — new
  action kinds then inherit metering from the registry, **for real this
  time**.
- **Retry interplay:** `dispatchAction` already wraps handlers in
  `withRetry(INTERACTIVE_MAX_ATTEMPTS)`. Handlers must call
  `generateStructured` with `maxRetries: 1` so attempts aren't multiplied
  (3 × 3). Each dispatcher attempt then writes exactly one invocation row —
  per-attempt provider cost stays accurate. Cross-attempt rows won't be linked
  via `retry_of` (the dispatcher re-runs the whole handler); instead set
  `related_entity_type='chat_message_action'`, `related_entity_id=<action id>`
  so all attempts of one action correlate — the columns already exist, the
  action id is a uuid (`chat_message_actions.id`), and the handlers already
  persist it via `insertChatMessageAction`.
- **Schema type:** the handlers define **zod** schemas while
  `GenerateStructuredOptions.schema` is typed `Schema<T>` (the `jsonSchema`
  flavor). Widen it to the AI SDK's `FlexibleSchema<T>` (accepts both) as
  part of the move — `Output.object()` takes either; no behavior change.
- **Both entry points covered:** the turn route and
  `/api/multimodal/action-retry` both go through `dispatchAction`, so one
  migration meters both. The action-retry route already resolves `classDbId`;
  the turn route already has full context — pass it into
  `DispatchActionArgs` (it already carries `classId`/`assignmentId`/etc. for
  app_logs).

### 5.4 Transliteration — the cautionary tale

`transliterateMessage` already flows through `generateStructured` but omits
the optional `invocation` param, so nothing is recorded. Under §7.1 this class
of bug disappears: the route resolves a metered handle (context bound at
resolution), and there is no optional hook left to forget. This one call site
is the proof of why metering must be a property of *holding a model*, not a
parameter callers remember to pass.

### 5.5 Legacy voice (Pipecat) — excluded

`/api/pipecat/start` hands the entire voice session (STT + LLM + TTS) to an
external Pipecat Cloud agent whose AI usage cannot be observed from this
codebase. The mode is retired and **slated for deprecation**, so it gets no
metering work — it is a documented exclusion until the route is deleted. (If
deprecation slips and legacy usage turns out to matter, the fallback is one
session-grain row per start call; don't build it speculatively.) The quota
guard does not apply to it either.

## 6. Decoupling always-on billing from debug payloads

`isAiInvocationLoggingEnabled()` currently gates the entire lifecycle, and
`persistAiInvocationStart` **awaits the GCS `request.json` upload before
returning the invocation id** — so today a GCS outage breaks invocation
tracking entirely. Split all of it:

- **Row lifecycle → always on.** `startAiInvocation` /
  `scheduleAiInvocationStart` always insert; `complete` / `fail` always update
  + meter. Remove every early `return null` / early-return disable path from
  the row writes.
- **GCS payload capture → keep the flag** (rename conceptually to
  `AI_INVOCATION_PAYLOAD_CAPTURE`) **and make it fire-and-forget.** The row
  insert must not await `uploadInvocationJson`; `request_storage_path` /
  `response_storage_path` are set only when capture is enabled (now legal —
  §4.1) and written by the detached upload task. A storage outage then costs us
  debug payloads, never billing rows.

This preserves the heavy/PII-sensitive debug capture as opt-in while making the
billing record unconditional and storage-independent.

## 7. Architecture: the AI gateway — leakage impossible by construction

Guardrail lists (lint rules, review checklists, "remember to pass the param")
reduce leaks; they don't eliminate them — §3.1 found three silent bypasses in
a codebase with exactly one team working on it. The durable fix is to
restructure *how code obtains the ability to call a provider at all*.
`src/lib/ai/gateway/` becomes the only place that holds credentials,
constructs provider clients, executes calls, and meters. Everything else in
the app can only obtain **metered handles**. Four nested layers, each catching
what the previous one can't:

### 7.1 Layer 1 — metered handles: you can't hold a raw model

Today `getCachedResolveModelConfig` returns a config (API key included) and
`getLanguageModel` returns a raw `LanguageModelV3` — a capability with no
obligations attached: anything holding it can call the provider SDK unmetered,
which is exactly how `mcq.ts` leaked. Invert it:

- **Model resolution returns a handle, not a model.**
  `resolveMeteredModel({ classDbId, appFunctionKey, userId, submissionId, … })`
  → `MeteredTextModel`, whose only methods are the funnels
  (`.generateStructured(...)`, `.streamTurn(...)`). Metering context is bound
  **at resolution time**; a call site cannot omit what it never passes. (The
  transitional idea of making `invocation` a required parameter is subsumed —
  there is no parameter left to forget.)
- **Speech identically:** `resolveMeteredSpeech(...)` → handles exposing
  `.transcribe()`, `.synthesize()`, `.openSynthesisSession()`. The **session
  object itself meters**: it counts the characters pushed
  (`pushTranscript` / `pushText`) and the audio bytes pumped, opens its row as
  `pending`, finalizes on close/abort. The turn route's inline TTS (§5.0
  row 6) then needs no route-side metering code at all — it just obtains its
  sessions from the gateway.
- **Quota moves inside the handle:** `assertWithinQuota` runs at handle
  resolution, so no current or future route can forget the §8 guard.
  Admission, execution, and metering travel together as one capability.

**Pinned API** — the only surface the rest of the app may consume:

```ts
// src/lib/ai/gateway/index.ts
export interface AiCallContext {
  classDbId: string | null;            // null only for platform-scope work
  assignmentId?: string | null;
  submissionId?: string | null;
  questionOrder?: number | null;
  attemptNumber?: number | null;
  userId?: string | null;              // acting user (request auth)
  relatedEntity?: { type: string; id: string } | null;
}

// Throws QuotaExceededError (→ QUOTA_EXCEEDED) or AiNotConfiguredError.
export function resolveMeteredModel(input: {
  appFunctionKey: string;              // e.g. "text.mcq_generation"
  context: AiCallContext;
}): Promise<MeteredTextModel>;

export interface MeteredTextModel {
  readonly meta: { provider: string; modelId: string; keySource: AiConfigSource };
  generateStructured<T>(opts: {
    schema: FlexibleSchema<T>;         // zod or jsonSchema (§5.3)
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    maxRetries?: number;
    onRetryAttempt?: OnRetryAttempt;
    schemaName?: string;
  }): Promise<T>;
  // Wraps createMultimodalTurnStream for the turn route.
  streamTurn(opts: MultimodalTurnStreamOptions): MultimodalTurnStream;
}

export function resolveMeteredSpeech(input: {
  kind: "stt" | "tts";
  catalogEntry: ModelCatalogEntry;     // the routes already resolve this
  assignmentId: string;                // class + BYOK key resolved server-side
  context: AiCallContext;
}): Promise<MeteredSttClient | MeteredTtsClient>;

export interface MeteredSttClient {
  transcribe(input: TranscribeInput): Promise<TranscribeResult>; // writes its own row
}
export interface MeteredTtsClient {
  readonly streamFormat: TtsStreamFormat;
  synthesize(input: SynthesizeInput): Promise<SynthesizeResult>;
  synthesizeStream?(input: SynthesizeInput): AsyncIterable<Uint8Array>;
  openSynthesisSession(opts: { language?: string; voice?: string }): Promise<MeteredTtsSession>;
}
// Wraps CartesiaTtsContinuationSession (pushTranscript) / SarvamTtsWebSocketSession
// (pushText) behind one interface; counts characters pushed + bytes consumed;
// opens its row as `pending`, finalizes on close (call close on abort too).
export interface MeteredTtsSession {
  pushText(text: string, opts?: { continueGeneration?: boolean }): void;
  consumeAudio(): AsyncGenerator<Uint8Array>;
  close(): Promise<void>;
}
```

`providerOptions` is resolved from the function binding *inside* the handle —
call sites no longer see it. Handles are per-request objects; nothing caches
them across requests (the existing config cache underneath already provides
the caching).

### 7.2 Layer 2 — key custody + import boundary: leaked code can't call out

- **No provider credential exists outside the gateway.** Env keys are read,
  and BYOK keys decrypted, only inside `src/lib/ai/gateway/` (which absorbs
  `getLanguageModel`, `providerOptionsForConfig`, the speech provider
  constructors, and `resolveProviderApiKeyForAssignment`). A bypassing code
  path has nothing to authenticate with.
- **The `ai` package and the speech provider clients are importable only
  inside the gateway.** Two enforcement layers, both concrete for this repo:
  - *Editor-time:* a rule in `eslint.config.mjs` (flat config, ESLint 9) —
    `@typescript-eslint/no-restricted-imports` on `ai` and the speech
    provider modules for all files outside `src/lib/ai/gateway/**`, with
    `allowImportNames: ["jsonSchema"]` (five `src/lib/ai/schemas/*` files +
    `konvo-voice/schema.ts` legitimately import the pure `jsonSchema` helper)
    and `allowTypeImports: true` (type-only imports are harmless).
  - *Build-time:* the §7.3 validation script also runs an import scan —
    necessary because `next build` no longer runs ESLint and the repo has
    **no CI**, so lint alone gates nothing. (dependency-cruiser would add a
    dependency for no additional coverage — dropped.)

  The restriction is module-level, so AI SDK surfaces we haven't wrapped yet
  (`embed()`, `generateImage()`, SDK-native transcription) are covered
  without enumerating them; a future feature that needs one must add a
  gateway funnel, which is precisely the review moment we want.

### 7.3 Catalog ↔ rate-card ↔ usage-type exhaustiveness check (build-gated)

The repo has **no test runner and no CI workflows**, and today has **no
`prebuild` hook at all** — `scripts/validate-locales.ts` is the existing
precedent for *the tsx-script shape* (a plain script of `assert*Valid()`
calls that each `throw new Error(...)` on the first violation, no manual
`process.exit`, `console.log` on success — see `src/lib/locales/validate.ts`),
but it's invoked manually (`npm run validate:locales`) and wired into nothing.
This plan introduces the **first build-blocking gate** this repo has had, not
an extension of an existing one — worth knowing going in, since it changes
what "green build" means here for the first time.

**Mechanism, concretely.** npm auto-runs a script named `pre<X>` immediately
before any `npm run <X>` — this is generic npm lifecycle behavior, not
Next.js- or Vercel-specific. So:

```json
"scripts": {
  "build": "next build",
  "validate:ai-metering": "npx tsx scripts/validate-ai-metering.ts",
  "prebuild": "npm run validate:ai-metering"
}
```

makes `npm run build` actually execute `validate:ai-metering` → (only if it
exits 0) → `next build`. `validate-ai-metering.ts` mirrors
`validate-locales.ts`'s shape exactly:

```ts
import { assertCatalogUsageTypesComplete } from "../src/lib/ai/metering/validate";
import { assertRateCardComplete } from "../src/lib/ai/metering/validate";
import { assertGatewayImportBoundaryHolds } from "../src/lib/ai/metering/validate";

assertCatalogUsageTypesComplete();
assertRateCardComplete();
assertGatewayImportBoundaryHolds();
console.log("AI metering: catalog, rate card, and import boundary are valid.");
```

Each `assert*` throws on the first violation with a message identifying the
offending model/usage_type/file and pointing at this plan; an uncaught throw
in a `tsx`-run script exits non-zero, which is what fails `prebuild`, which is
what aborts the `build` chain before `next build` ever runs.

**Verified this actually reaches Vercel, not just local builds:** this repo
uses **npm** (`package-lock.json`, no `pnpm-lock.yaml`/`yarn.lock`) and has
**no `vercel.json`** overriding the build command. With no override, Vercel's
Next.js framework preset runs the build through the detected package
manager's `build` script — i.e. `npm run build` — which is exactly the
invocation the `prebuild` hook attaches to. (This isn't automatic in general:
a `vercel.json` with an explicit `"buildCommand": "next build"`, or a
pnpm repo without `enable-pre-post-scripts`, would silently skip the hook —
neither applies here, but it's the kind of thing worth re-checking if the
package manager or Vercel config ever changes.) One boundary this gate does
**not** cover: `next dev` / `next start` don't go through `build`, so it's a
ship-time gate, not a dev-time guard.

The script asserts:

1. Every (model, task) pair in `CATALOG_MODELS` resolves to a `usage_type`,
   and every `ModelTask` maps into the §4.2 vocabulary.
2. Every (provider, model, usage_type) — including `coming_soon` entries and
   every `CATALOG_FUNCTIONS` binding — resolves a rate at `RATE_VERSION` or
   is explicitly marked `unpriced`.
3. The §7.2 import boundary holds: no file outside `src/lib/ai/gateway/`
   value-imports `ai` (other than `jsonSchema`) or the speech provider
   modules.

Adding a model or modality without pricing/metering intent fails the build
with a message pointing at this plan.

### 7.4 Layer 3 — runtime backstops: the unforeseen still gets recorded

- **Request context via AsyncLocalStorage.** AI-capable routes run under
  `runWithAiContext({ userId, classId, institutionId })`; the gateway reads it
  for attribution defaults. Fail-closed policy: in dev/test, an AI call with
  no resolvable context **throws**; in production it executes but writes an
  `app_function_key='unattributed'` row plus an error log. A leak becomes loud
  misattribution, never a missing record.
- **Instrumented fetch.** The gateway constructs every provider client with a
  wrapped `fetch` (the AI SDK providers and our speech clients both accept
  one). Any provider HTTP request that completes without a funnel-written row
  yields a skeletal usage row at the transport layer — the catch-all for
  gateway-internal mistakes and SDK surfaces nobody anticipated.
- **Metering never blocks the user call** (missing rate → null cost + warn,
  §4.4 rule 3); it only refuses to be silent — every degradation lands in
  `app_logs`.

### 7.5 Layer 4 — external ground truth: leak detection beyond the app

App-level discipline cannot see calls made outside the app (a stray script, a
future second service). In increasing order of effort:

1. **Invoice reconciliation (do this):** monthly, compare provider invoices
   for platform keys against `ai_invocations` aggregates per provider/model;
   investigate discrepancies beyond tolerance. Cheap, catches everything
   eventually, and doubles as validation of our measured metrics (the OpenAI
   TTS approximation, Sarvam self-measured durations).
2. **Egress proxy (defer):** route provider traffic through an LLM gateway
   service (LiteLLM, Vercel AI Gateway, Cloudflare AI Gateway) that holds the
   real keys and issues the app virtual keys — an independent, tamper-proof
   usage log and hard egress control. Complication: institution/class BYOK
   requires per-tenant virtual keys (LiteLLM supports this). Revisit when
   billing revenue justifies the infrastructure.

### 7.6 "Adding an AI feature" checklist

A short doc (`docs/adding-ai-usage.md`, mirroring `docs/adding-activity-types.md`)
listing: pick/extend `usage_type` → add rate entries → obtain a metered handle
from the gateway (never a raw client or key) → run
`npm run validate:ai-metering` (§7.3) and make it pass.
New engineers get the contract in one page.

## 8. Read path — wallet balance & enforcement (institution + class, both key owners)

`getQuotaStatus({ institutionId, classId, keyOwner })` /
`assertWithinQuota(...)`:

1. Resolve `keyOwner` from the call's key source (platform/env → `platform`;
   institution/class → `byok`) — known at handle resolution time, the same
   place `keySource` is already resolved (§7.1).
2. Look up the most specific `ai_credit_wallets` row for `(scope, key_owner)`
   (§4.6) — class → institution, same key_owner.
3. Read `ai_credit_balances.balance` for that `wallet_id` — one indexed PK
   lookup, no aggregation, no counter-vs-cap comparison. This is the single
   number enforcement cares about, however it got funded (recurring grant,
   top-up, or both — §4.6).
4. Apply `enforcement` against the balance:
   - `off` → allow. Default for every wallet, both key owners — nothing is
     capped until an admin explicitly opts in.
   - `warn` → allow; if `balance < soft_warn_threshold`, surface a low-balance
     banner / notify admins (`logAppEvent`) / email.
   - `block` → if `balance <= 0`, **reject before the model call** with a new
     `QUOTA_EXCEEDED` code added to the `AiErrorCode` union in
     `src/lib/ai/errors.ts` (the taxonomy is uppercase; mark it
     non-retryable), so it flows through the existing retry/error surfacing
     as a clear message (not a generic failure).
5. The resolved `wallet_id` travels with the handle so `completeAiInvocation`
   can debit it directly (§5) — no second wallet lookup at write time.

Placement: inside the gateway (§7.1) — `assertWithinQuota` runs when a metered
handle is resolved, so every AI surface, current and future, is guarded
without each route having to remember a guard. A streaming turn checks once at
handle resolution — the turn's inline TTS and spawned actions are consequences
of the admitted turn, and re-checking mid-stream would add races for no
control benefit.

**BYOK is capped independently of platform spend, via its own wallet, not
exempt from capping.** The `key_owner` dimension (§4.5, §4.6) makes the two
wallets fully independent: an institution can run with a platform wallet
capped and BYOK uncapped, both capped, or (today's default, since every
wallet starts `enforcement='off'`) neither — no behavior change until an
admin opts in. Both wallets are funded and drained through the identical
mechanism (§4.6) — no key-owner-specific logic anywhere in the enforcement path.
A small balance overshoot from in-flight concurrency is acceptable for v1,
for both key owners (a wallet can dip slightly negative before the *next* check
catches it — same tolerance the old counter-vs-cap model had).

### 8.1 Usage distribution — where credits are being spent

Capping answers "how much is left." Teachers and admins also need "where did
it go" and "where did it come from" — three different reads, from three
different tables, none of them a scan:

| Question | Source | Query shape |
| --- | --- | --- |
| Current balance (how much is left right now) | `ai_credit_balances` | One PK lookup on `wallet_id` (§4.6) — the same read `assertWithinQuota` does. |
| Funding history (grants + top-ups, who/when) | `ai_credit_transactions` | `where wallet_id = … order by created_at desc` — a class owner's "you bought 2,000 credits on July 28" receipt trail. |
| By modality (`usage_type`) | `ai_usage_counters` | Already rolled up per `(scope, key_owner, usage_type)` — O(1), no scan. |
| By `key_owner` (platform vs BYOK) | `ai_usage_counters` | Same PK, different `key_owner` value. |
| By model (`ai_provider` + `ai_model_id`) | `ai_invocations` | `group by` over the period window for the scope — coarse-grained (a handful of active models), cheap. |
| By class (institution admin view) | `ai_invocations` | `group by class_id` within the institution — surfaces which class is the heaviest spender. |
| By teacher/user (`user_id`) | `ai_invocations` | `group by user_id` within the scope — needs `user_id` populated (§4.1, already added for exactly this). |
| Over time (trend within the period) | `ai_invocations` | `group by date_trunc('day', started_at)` for a sparkline; the period boundary matches `ai_usage_counters.period_start` (§10 #6). |

These are Phase 4 deliverables (`src/lib/queries/aiUsage.ts`, §11) — one
query module, parameterized by scope + key_owner + group-by dimension, backing
both the institution-admin dashboard (their institution, all classes) and the
teacher dashboard (their own class only, via the existing `is_class_teacher_admin`
RLS policy, §4.3). No new columns are needed for any of these cuts — every
dimension above already exists on `ai_invocations` for other reasons (billing
attribution, RLS, catalog identity).

## 9. Phasing

1. **Phase 1 — Gateway + universal capture (no enforcement).** Migration
   (§4.1–4.3) + always-on/GCS decouple (§6) + the gateway inversion (§7.1–7.2:
   metered handles, key custody, import boundary — every call site is being
   touched anyway, so do the inversion once instead of a transitional
   required-param step) + action-layer migration (§5.3) + wire all speech
   surfaces incl. turn-inline TTS (§5.0 rows 4–6) + rate card v1 (blended
   rates) + exhaustiveness script (§7.3). Start accruing complete history
   immediately. **Step-by-step order in §9.1 — implementation starts there.**
2. **Phase 2 — Counters + reconcile + backstops.** `ai_usage_counters` (now
   with the `key_owner` dimension, §4.5) + `record_usage_counter` + nightly
   rebuild/drift check against `ai_invocations` (also flags null-cost rows,
   unattributed rows, and unclosed `pending` session rows) + runtime
   backstops (§7.4: ALS context, instrumented fetch) + the monthly
   invoice-reconciliation habit (§7.5, now also useful for BYOK institutions
   checking a `key_owner='byok'` cap against their real bill).
3. **Phase 3 — Wallets + enforcement.** `ai_credit_wallets` /
   `ai_credit_transactions` / `ai_credit_balances` (§4.6, `key_owner` dimension)
   + `grant_monthly_credits` / `record_topup` / `debit_wallet_balance` +
   the scheduled monthly grant job (a cron invoking `grant_monthly_credits`
   for every wallet with `monthly_grant is not null`) + `getQuotaStatus` /
   `assertWithinQuota` inside handle resolution reading balance, not a
   counter (key-owner-aware, §8) + `QUOTA_EXCEEDED` taxonomy code + a top-up
   purchase endpoint (payment itself is out of scope — this endpoint runs
   only after an external payment confirms) + in-product messaging
   (institution and class, both key owners).
4. **Phase 4 — Dashboards.** Super-admin (all), institution-admin (own),
   teacher (own class) usage views, broken out by `key_owner`, plus the
   spend-distribution cuts and balance/funding-history views in §8.1;
   wallet editor (recurring grant amount, rollover cap, enforcement mode)
   + a top-up action for class owners. Mirror the `app_logs` viewer
   components/queries.
5. **Phase 5 — Billing export.** Per-period, per-institution (and per-class)
   invoice rollup in credits (+ `cost_usd` for reference), reconciled against
   `ai_credit_transactions` (what was granted/bought) vs. `ai_invocations`
   (what was spent); CSV/JSON or billing-provider integration.
6. **Later, as they become real:** per-token-class rates (metrics reserved);
   realtime metering (gemini-live; heartbeats); streaming STT
   (`sttDelivery:'stream'`); image/video/embedding usage types (reserved);
   per-student quotas (grain columns already captured); rate table in DB if
   finance needs runtime repricing; per-attempt speech rows if provider-cost
   fidelity on STT/TTS retries matters; service-tier rate dimension; egress
   proxy (§7.5) if independent ground truth becomes worth the infrastructure.

### 9.1 Phase 1 — ordered implementation sequence

Each step lands independently and leaves the app shippable; order matters
(later steps consume earlier ones). File-level detail in §11.

**Step 1 — Migration**
(`supabase/migrations/20260713000000_ai_invocations_metering.sql`): §4.1
columns, `request_storage_path` NOT NULL dropped, `institution_id` backfill,
indexes, §4.3 read policy. *Done when:* the migration applies cleanly and
existing (flag-gated) invocation writes work unchanged.

**Step 2 — Metering core (pure additions, no call sites touched):**
`usageTypes.ts`, `rates.ts` (per-metric `usdPerUnit` for every live model,
one global `CREDITS_PER_USD` constant, `unpriced` markers for `coming_soon`,
`RATE_VERSION = 'v1'` — §4.4), `computeUsage.ts` (`cost_usd = rawUnits ×
usdPerUnit`; `credits = cost_usd × CREDITS_PER_USD` — both computed to full
`numeric(14,8)` precision, never rounded or floored at write time), and
`scripts/validate-ai-metering.ts` + the npm `validate:ai-metering` /
`prebuild` wiring (§7.3). *Done when:* `npm run validate:ai-metering` passes —
and fails when a catalog model's rate entry is deliberately removed.

**Step 3 — Always-on lifecycle (§6):** `recordInvocation.ts` — row writes
unconditional (drop the `isAiInvocationLoggingEnabled` early-returns from row
paths), GCS uploads detached + flag-gated (paths written by the upload task
only), `complete`/`fail` gain institution (export `resolveInstitutionId` from
`appLog.ts`) / user / metrics / cost via `computeUsage`. *Done when:* with the
flag OFF, a rubric generation writes a completed row with tokens + `cost_usd`
and null storage paths; with the flag ON, payloads still upload and paths get
set.

**Step 4 — The gateway (§7.1–7.2):** create `src/lib/ai/gateway/` absorbing
`getLanguageModel`, `providerOptionsForConfig`, speech provider construction,
and key resolution (extend `getProviderApiKey` to report the supplying
scope); implement `resolveMeteredModel` / `resolveMeteredSpeech` /
self-metering TTS sessions per the pinned API; add the ESLint rule and the
script's import scan. `context.ts` (ALS) ships as a stub reading explicit
args — the full backstop is Phase 2. *Done when:* the import scan passes with
the gateway as the only importer.

**Step 5 — Text call sites onto handles:** rubric gen (×3 calls), dynamic
questions, evaluation (`evaluateSubmission.ts`), transliteration, and the
turn route's `streamTurn`. *Done when:* every text surface writes attributed
rows — transliteration rows appear for the first time.

**Step 6 — Action layer (§5.3):** `resolveActionModel` returns a handle,
`dispatcher.ts` threads it, `mcq.ts` / `suggested-response.ts` call
`handle.generateStructured({ maxRetries: 1, … })` with
`relatedEntity = { type: 'chat_message_action', id }`. *Done when:* an MCQ
turn writes an invocation row linked to the action id, and
`/api/multimodal/action-retry` writes another with the same
`related_entity_id`.

**Step 7 — Speech surfaces (§5.0 rows 4–6, §5.1):** `SpeechUsage` + STT
wrapper capture, transcribe route, tts route, turn-route inline TTS switched
to gateway sessions. *Done when:* one full multimodal audio turn produces
exactly three rows — `speech_to_text` (with `audio_ms`), `text_generation`
(with token breakdowns), `text_to_speech` (with `characters` +
`audio_output_ms`) — all costed and attributed.

**Step 8 — Docs + end-to-end pass:** write `docs/adding-ai-usage.md` (§7.6);
click through every user flow, then verify
`select usage_type, count(*), sum(cost_usd), sum(credits), min(credits) from
ai_invocations group by 1` shows every surface, no null `institution_id` on
class-scoped flows, no null-cost/null-credit rows for live models,
`min(credits) > 0` for every priced row (exact and proportioned — no floor to
check for, §4.4), and no lingering `pending` rows.

## 10. Decisions — adopted defaults

Every previously-open question now has a working default so implementation is
unblocked. Each is deliberately cheap to revise later (rate-version snapshots
+ rebuildable counters mean a policy change is a code edit, not a redesign).

| # | Decision | Adopted default | Changing it later |
| --- | --- | --- | --- |
| 1 | One table for audit + billing | Yes — `ai_invocations` wears both hats; the §6 split (row always-on, payloads flagged + detached) keeps the roles independent. | Split tables only if write load ever demands it. |
| 2 | RLS read exposure | Ship the three-tier row policy (§4.3) — rows carry ids/metrics/GCS paths, never prompt content. | Swap to `security definer` aggregate views with no schema change. |
| 3 | Credits formula | `credits = cost_usd × CREDITS_PER_USD` — one global constant (v1 placeholder, e.g. 1 credit = $0.001), applied uniformly across every modality, computed to full `numeric(14,8)` precision and **never rounded or floored at write time** (§4.4). `cost_usd` (from per-metric `usdPerUnit`) stays the backend-only ledger, never shown to users, never in `ai_usage_counters`. Rounding is a display-layer concern only — the stored/summed/compared value is always exact, so there's no compounding drift and no per-call floor to reason about. Pinned as `RATE_VERSION 'v1'`. | Repricing (`CREDITS_PER_USD` or per-metric `usdPerUnit`) is forward-only via a new `RATE_VERSION`; history is immutable by construction. |
| 4 | BYOK vs caps | Both are capped, **independently**, via separate wallets (§4.5–§4.6). Every wallet still starts `enforcement='off'`, so nothing is capped until an admin opts in. v1 shares one `CREDITS_PER_USD` across both key owners (#3) — no special-cased "BYOK stays flat" logic needed; a future key-owner-price divergence is a new rate version, not a `computeUsage` branch. | Counters (analytics) are a rebuildable cache: policy edit + rebuild. Add a per-BYOK-key wallet (today: one wallet per scope+key_owner) if institutions want to protect one BYOK provider key but not another. |
| 5 | Retry credits | v1 charges credits for **every attempt** — retries are real provider cost. | `retry_index > 0` exclusion is a `computeUsage` flag. |
| 6 | Billing period | Calendar month, UTC: `period_start = (date_trunc('month', started_at at time zone 'utc'))::date`, for `ai_usage_counters` analytics buckets *and* the monthly grant job's cadence (§4.6). | Institution-specific grant anchors live on `ai_credit_wallets` later. |
| 7 | Turn-inline TTS granularity | One row per turn (WS session, or fallback-chunk roll-up). | Per-chunk rows only if invoice reconciliation demands them. |
| 8 | STT duration source | Provider-reported (`metric_source='provider'`) when available; else measured (Sarvam last-timestamp / server-derived); else client `recordingDurationMs` as `'estimated'`. Server-side audio decoding deferred. | Tighten if monthly reconciliation shows drift. |
| 9 | Gateway inversion | Adopted — Phase 1 does the inversion directly; the transitional required-`invocation`-param alternative is rejected (leaves raw models in circulation). | — |
| 10 | Metering durability | Best-effort detached writes + `app_logs` on every drop + Phase 2 nightly rebuild/drift check. | Upgrade to a transactional outbox if drift materializes. |
| 11 | Always-on write volume | Accepted — text rows already existed behind the flag; speech adds low-rate rows; §4.1 indexes are aggregation-first. | Partition/archive by month if volume grows. |
| 12 | OpenAI TTS token-billing mismatch | Meter `characters` + `audio_output_ms` as a flagged approximation; reconcile against the monthly invoice (that is what `metric_source` + `provider_request_id` exist for). | Add a token-estimate metric if reconciliation drifts. |
| 13 | Allocation model — cap vs. wallet | **Wallet, not a period-reset cap** (§4.6): a real balance, funded by a recurring monthly grant (nullable — `null` means pure top-up, no recurring renewal) and/or on-demand top-ups, drained by usage, with an optional `max_balance` that bounds rollover only. `max_balance` never clamps a top-up (money already paid — that check belongs in the purchase flow, before charging, not as a post-hoc clamp). One mechanism covers recurring-only, top-up-only, and hybrid funding. | Each wallet's `monthly_grant` / `max_balance` / `enforcement` is a per-row config edit, not a schema change. A true multi-currency purchase price for top-ups is a separate, still-open decision (see the currency deferral note below). |
| 14 | Metric storage — typed column vs. jsonb, per metric | **Typed column only for metrics that are both (a) actually billed today and (b) can't share a row with a sibling metric of the same kind.** `audio_ms`/`characters`/`audio_output_ms`/`session_ms` stay columns — live billing inputs, and TTS already needs two of them (`characters` + `audio_output_ms`) on one row, which rules out a single generic `(metric_value, metric_type, metric_source)` triple without either breaking "one row per AI call" (§2) or standing up a one-to-many child table. Every token-class breakdown (`cachedInputTokens`, `reasoningTokens`, `audioInputTokens`, `imageInputTokens`, …) lives in `token_details` jsonb instead — none of them are priced separately from the blended rate yet, so there's no query pattern to optimize for, and a jsonb bag holds arbitrarily many co-occurring keys on one row with no schema churn. Shape enforced by a TS type in `computeUsage.ts`, not SQL. | Promote a `token_details` key to a real column if it becomes a genuinely hot, indexed-lookup-worthy query — an expression index covers the interim. Add a new non-token metric column only when a usage_type that needs it actually ships (§4.2's vocabulary is exhaustiveness-checked, so this can't be forgotten). |

Still genuinely open (non-blocking): the real credit price / margin once
finance weighs in (lands as a new rate version), whether teachers should
eventually see per-row usage or only aggregates (the #2 swap), whether a
BYOK cap should ever be split per-provider-key rather than one per
scope+key_owner (#4), and the actual payment/billing provider a top-up purchase
flow would run through (out of scope for this plan — none exists in the
codebase today, §4.6).

**Deferred, not designed away — local currency.** v6 of this plan drafted a
full FX boundary (`institutions.billing_currency`, a versioned `fx_rates`
table, per-limit input/FX snapshots) so admins could set caps and read bills
in ₹/€/etc. while the ledger stayed USD-denominated underneath. v7 cut it:
this version metes, allocates, caps, and displays everything in **credits
only** — simpler to build and to explain, and it's what §1's goals actually
require first. If local-currency input/display becomes a real ask, the v6
design (rate card §4.4's single-currency-internally principle, FX only at the
input/display boundary, snapshotted like `rate_version`) is the shape to
revive — nothing in the wallet model (§4.6) blocks adding it later as a pure
UI-layer conversion on top of `ai_credit_balances.balance` / a top-up's
`ai_credit_transactions.credits`.

## 11. File map (to build)

Phase 1 (§9.1 step in parentheses):

- `supabase/migrations/20260713000000_ai_invocations_metering.sql` — extend
  columns, relax NOT NULL, backfill, indexes, RLS read policies (step 1).
- `src/lib/ai/metering/usageTypes.ts` — usage_type registry (§4.2) (step 2).
- `src/lib/ai/metering/rates.ts` — rate card (TS), `RATE_VERSION`,
  `CREDITS_PER_USD`, resolver with fallback chain + `unpriced` markers
  (step 2).
- `src/lib/ai/metering/computeUsage.ts` — raw metrics → `cost_usd`
  (`rawUnits × usdPerUnit`, backend-only) and `credits` (`cost_usd ×
  CREDITS_PER_USD`, exact, unrounded) — a linear rescaling, both at full
  `numeric(14,8)` precision, per §4.4 (step 2).
- `scripts/validate-ai-metering.ts` — the §7.3 exhaustiveness + import-scan
  script; `package.json` gains `"validate:ai-metering"` and
  `"prebuild": "npm run validate:ai-metering"` (step 2).
- `src/lib/ai/logging/recordInvocation.ts` — always-on rows; detached
  flag-gated payload capture; institution/user/metrics/cost + (Phase 2)
  counter upsert in `complete`/`fail` (step 3).
- `src/lib/ai/logging/types.ts` — `usageType`, speech metrics, breakdowns,
  `userId` on the invocation input types (step 3).
- `src/lib/logging/appLog.ts` — export the currently-private
  `resolveInstitutionId` (step 3).
- `src/lib/ai/gateway/` — `index.ts` (`resolveMeteredModel` /
  `resolveMeteredSpeech` per the §7.1 pinned API; quota check at resolution
  from Phase 3), `context.ts` (AsyncLocalStorage request context — stub until
  Phase 2), `meteredFetch.ts` (transport backstop — Phase 2); absorbs
  `getLanguageModel`, `providerOptionsForConfig`, speech provider
  construction, and all key resolution, extending `getProviderApiKey` /
  `resolveProviderApiKeyForAssignment` to report the supplying scope
  (§7.1–7.2) (step 4).
- `src/lib/ai/structured.ts` — becomes the internal implementation of
  `MeteredTextModel.generateStructured`; `schema` widens to
  `FlexibleSchema<T>`; gains `providerMetadata` breakdown capture (step 4).
- `eslint.config.mjs` — §7.2 import-boundary rule (editor feedback; the
  build-time gate is the validation script) (step 4).
- Text call sites onto handles (step 5): `generate-rubric-and-answer/route.ts`
  (×3 calls), `generate-dynamic-questions/route.ts`,
  `evaluate/route.ts` + `src/lib/ai/evaluateSubmission.ts`,
  `src/lib/ai/transliterateMessage.ts` +
  `src/app/api/multimodal/transliterate/route.ts` (already resolves
  `classDbId`), multimodal `turn/route.ts` (`streamTurn` + LLM breakdowns).
- `src/lib/multimodal/actions/resolveActionModel.ts` — return a metered
  handle; `dispatcher.ts` — thread it; `mcq.ts` / `suggested-response.ts` —
  `generateObject` → `handle.generateStructured({ maxRetries: 1 })` +
  `relatedEntity` = action id (§5.3) (step 6).
- `src/lib/konvo-voice/speech/types.ts` + STT wrappers — `SpeechUsage`
  (§5.1); speech emission wiring in `transcribe/route.ts`, `tts/route.ts`
  (both plumb class context server-side), and `turn/route.ts` inline-TTS
  sessions obtained from the gateway (step 7).
- `docs/adding-ai-usage.md` — the §7.6 checklist (step 8).

Later phases:

- `supabase/migrations/*_ai_usage_counters.sql` — counter table (sentinel
  class_id, `key_owner` dimension) + `record_usage_counter` function, now
  key-owner-aware (§4.5) (Phase 2).
- `supabase/migrations/*_ai_credit_wallets.sql` — `ai_credit_wallets` +
  `ai_credit_transactions` + `ai_credit_balances` (§4.6), `key_owner` dimension,
  RLS mirroring §4.3's three-tier policy (+ optional `ai_usage_rates` if/when
  the rate card moves to DB) (Phase 3).
- `src/lib/ai/metering/wallet.ts` — `grant_monthly_credits` /
  `record_topup` / `debit_wallet_balance` SQL function wrappers (§4.6)
  (Phase 3).
- `src/lib/ai/metering/quota.ts` — `getQuotaStatus` / `assertWithinQuota`,
  key-owner-aware, reading `ai_credit_balances` (§8) (Phase 3).
- A scheduled job (cron) invoking `grant_monthly_credits` for every wallet
  with `monthly_grant is not null`, at each `period_start` (§4.6, §10 #6)
  (Phase 3).
- A top-up purchase endpoint calling `record_topup` after an external
  payment confirms (payment provider itself out of scope, §10 #13) (Phase 3).
- `src/lib/ai/errors.ts` — add `QUOTA_EXCEEDED` (non-retryable) (Phase 3).
- `src/lib/queries/aiUsage.ts` — parameterized scope+key_owner+group-by query
  module backing the §8.1 distribution cuts (balance, funding history,
  modality/model/class/teacher/time) + admin/teacher usage pages &
  components, broken out by `key_owner`; wallet editor (grant amount, rollover
  cap, enforcement) + a top-up action for class owners (Phase 4).

## 12. Relationship to existing systems

- **`ai_invocations`** — promoted from "text debug audit" to **the universal
  system of record for every AI call**, all modalities, always-on for the row.
  Debug GCS payloads remain opt-in and detached. See
  `dev-docs/ai-retry-and-failure-recovery-plan.md` for the retry/error taxonomy
  it already participates in (that plan's retry bubbles and this plan's
  per-attempt rows are the same rows).
- **`app_logs`** — metering reuses its institution-denormalization +
  service-role fire-and-forget + RLS patterns, and is the sink for
  metering-write failures and missing-rate warnings.
- **AI gateway** (`src/lib/ai/gateway/`, §7) — becomes the single custody
  point for provider keys and clients; `resolveRuntime` / credential
  resolution / `getLanguageModel` / speech provider construction all move
  behind it, and every feature consumes metered handles.
- **Model catalog** (`src/lib/ai/catalog/`) — source of truth for
  provider/model/modality; `usage_type`, the rate card, and the CI
  exhaustiveness test all key off it, so the catalog remains the single place
  a new model or modality is introduced.
- **Action registry** (`src/lib/multimodal/actions/registry.ts`) — once §5.3
  lands, an action's `appFunctionKey` is also its metering identity; new
  action kinds inherit metering the same way they inherit retries.
- **Class/institution RLS helpers** (`is_class_teacher_admin`,
  `is_institution_admin`, `is_platform_super_admin`) — power the three-tier
  read policy with no new auth plumbing.
