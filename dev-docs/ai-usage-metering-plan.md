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
(§7.1).

## 1. Goal

Build a **holistic, authoritative meter** for every unit of AI work the platform
performs, so we can:

- **Limit usage** — enforce quotas / caps / soft warnings at **institution and
  class** granularity, with a cheap O(1) pre-flight check.
- **Charge customers** — produce a stable, auditable per-period bill per
  institution (and per class), in a normalized internal currency ("credits") and
  in provider cost (USD).
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
| **Token-only metrics** — no audio-seconds, characters, session-seconds, or token-class breakdowns. | Add `audio_ms`, `characters`, `audio_output_ms`, `session_ms`, `cached_input_tokens`, `reasoning_tokens`, `token_details` (§4.1). |
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

  -- token-class breakdowns for multimodal / cached / reasoning pricing (§5.2)
  add column cached_input_tokens integer,  -- cachedContentTokenCount / cached_tokens
  add column reasoning_tokens    integer,  -- thoughtsTokenCount / reasoning_tokens
  add column token_details       jsonb,    -- per-modality ModalityTokenCount blob (raw)

  -- attribution
  add column institution_id  uuid references public.institutions(id) on delete set null,
  add column user_id         uuid references auth.users(id) on delete set null,

  -- billing snapshots (computed at write time from the rate card)
  add column cost_usd        numeric(14,8),   -- 8 dp: sub-micro-dollar per-row precision
  add column credits         numeric(14,4),
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

Maps `(provider, model, usage_type, metric)` → USD **and** credits per unit,
effective-dated. Start as **typed TS config**
(`src/lib/ai/metering/rates.ts`, keyed off the catalog, versioned by a
`RATE_VERSION` constant) — fast, testable, colocated — and migrate to a DB
table only when finance needs runtime edits.

```
metric ∈ 'input_token' | 'output_token'
       | 'cached_input_token' | 'reasoning_token'
       | 'audio_input_token' | 'image_input_token'      -- per-modality token classes
       | 'audio_second' | 'audio_output_second'
       | 'character' | 'session_second'
       | 'image' | 'video_second' | 'request'           -- reserved for future types
rate  = { usdPerUnit, creditsPerUnit }
```

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
   (If we ever bill from a provider's non-USD price list — e.g. Sarvam quotes
   INR — convert to USD inside the rate card at a pinned FX rate and note it in
   the rate entry; the row stays single-currency.)
5. **Service tiers are a rate dimension, not a schema change.** If we later use
   batch/priority tiers, key the rate on `(model, metric, tier)` with tier
   defaulting to `standard`.

### 4.5 `ai_usage_counters` — fast enforcement at class + institution grain

Summing `ai_invocations` on every call is too slow for a pre-flight gate.
Maintain incrementally-updated rollups keyed to **both** grains in one table.

> **Fix from v2:** the previous draft put a *nullable* `class_id` in the
> primary key. Postgres primary keys force NOT NULL, so that design is
> invalid. Use a **zero-UUID sentinel** for the institution-wide rollup
> instead — it keys cleanly in the PK and in `ON CONFLICT`.

```sql
create table public.ai_usage_counters (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  -- '00000000-0000-0000-0000-000000000000' = institution-wide rollup (no class FK on sentinel)
  class_id       uuid not null default '00000000-0000-0000-0000-000000000000',
  period_start   date not null,          -- billing bucket (e.g. month start)
  usage_type     text not null,          -- or 'all' for a cross-modality total
  credits        numeric(14,4) not null default 0,
  cost_usd       numeric(14,8) not null default 0,
  events         bigint not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (institution_id, class_id, period_start, usage_type)
);
```

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
  p_period_start date,
  p_usage_type text,
  p_credits numeric,
  p_cost_usd numeric
) returns void
language sql security definer set search_path = public as $$
  insert into public.ai_usage_counters as c
    (institution_id, class_id, period_start, usage_type, credits, cost_usd, events)
  select distinct  -- distinct: when p_class_id is null the class rows collapse into the sentinel rows
    p_institution_id, v.cid, p_period_start, v.ut, p_credits, p_cost_usd, 1
  from (values
    (coalesce(p_class_id, '00000000-0000-0000-0000-000000000000'::uuid), p_usage_type),
    (coalesce(p_class_id, '00000000-0000-0000-0000-000000000000'::uuid), 'all'),
    ('00000000-0000-0000-0000-000000000000'::uuid, p_usage_type),
    ('00000000-0000-0000-0000-000000000000'::uuid, 'all')
  ) as v(cid, ut)
  on conflict (institution_id, class_id, period_start, usage_type)
  do update set
    credits    = c.credits + excluded.credits,
    cost_usd   = c.cost_usd + excluded.cost_usd,
    events     = c.events + excluded.events,
    updated_at = now();
$$;
-- service-role only: revoke execute from anon, authenticated
```

**Only platform-paid usage hits the counters** (`ai_key_source in
('platform','env')`): counters exist solely to enforce platform credit caps;
BYOK rows keep full cost/credits on `ai_invocations` for analytics (decision
§10 #4). Counters are a pure cache of `ai_invocations` → **rebuildable** by
re-aggregating the base table (nightly reconcile, §9), which is also what
makes this policy cheap to change.

- **Institution total** (O(1) limit read): `(inst, SENTINEL, 'all')`.
- **Class total**: `(inst, class, 'all')`.
- Per-modality drill-downs come from the `usage_type` rows.

### 4.6 `ai_usage_limits` — quota policy (institution or class)

```sql
create table public.ai_usage_limits (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  class_id       uuid references public.classes(id) on delete cascade,  -- null = whole institution
  period         text not null default 'monthly',   -- 'monthly' | 'none'
  hard_cap_credits  numeric(14,4),   -- null = unlimited; block over this
  soft_warn_credits numeric(14,4),
  enforcement    text not null default 'off',       -- 'off' | 'warn' | 'block'
  updated_at     timestamptz not null default now(),
  unique (institution_id, class_id)
);
```

Enforcement checks the **most specific** applicable limit (class limit if
present, else institution limit). A future per-student grain slots in as
another nullable scope column + the `user_id` we're already recording — no
redesign needed.

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
4. Calling `record_usage_counter(...)` (the four atomic upserts).
5. On failure of any metering step, `logAppEvent({ level:'error',
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

1. **Store the raw breakdown from day one** (`cached_input_tokens`,
   `reasoning_tokens`, `token_details` — §4.1) even while billing at a blended
   rate: raw metrics can never be recovered retroactively; a reprice/backfill
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

The repo has **no test runner and no CI workflows** — its existing pattern
for checks like this is a tsx script (`scripts/validate-locales.ts`). Mirror
it: `scripts/validate-ai-metering.ts`, wired into `package.json` as
`"validate:ai-metering": "npx tsx scripts/validate-ai-metering.ts"` plus
`"prebuild": "npm run validate:ai-metering"`, so `next build` (locally and on
Vercel) cannot succeed without it. The script asserts:

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

## 8. Read path — limits & enforcement (institution + class)

`getQuotaStatus({ institutionId, classId })` / `assertWithinQuota(...)`:

1. Look up the most specific `ai_usage_limits` row (class → institution).
2. Read the matching `ai_usage_counters` total (`(inst, class, 'all')` or
   `(inst, SENTINEL, 'all')`) — one indexed PK lookup, no aggregation.
3. Apply `enforcement`:
   - `off` → allow.
   - `warn` → allow; if over `soft_warn_credits`, surface a banner / notify
     admins (`logAppEvent`) / email.
   - `block` → if projected usage would exceed `hard_cap_credits`, **reject
     before the model call** with a new `QUOTA_EXCEEDED` code added to the
     `AiErrorCode` union in `src/lib/ai/errors.ts` (the taxonomy is
     uppercase; mark it non-retryable), so it flows through the existing
     retry/error surfacing as a clear message (not a generic failure).
     BYOK-keyed handles skip the check entirely (§10 #4) — key source is
     known at resolution time (`resolveModelConfig` returns `keySource`).

Placement: inside the gateway (§7.1) — `assertWithinQuota` runs when a metered
handle is resolved, so every AI surface, current and future, is guarded
without each route having to remember a guard. A streaming turn checks once at
handle resolution — the turn's inline TTS and spawned actions are consequences
of the admitted turn, and re-checking mid-stream would add races for no
control benefit.

Adopted policy (§10 #4): BYOK (`ai_key_source in ('institution','class')`)
usage is metered on rows but **not** enforced against platform credit caps —
BYOK-keyed handles skip the check. A small cap overshoot from in-flight
concurrency is acceptable for v1.

## 9. Phasing

1. **Phase 1 — Gateway + universal capture (no enforcement).** Migration
   (§4.1–4.3) + always-on/GCS decouple (§6) + the gateway inversion (§7.1–7.2:
   metered handles, key custody, import boundary — every call site is being
   touched anyway, so do the inversion once instead of a transitional
   required-param step) + action-layer migration (§5.3) + wire all speech
   surfaces incl. turn-inline TTS (§5.0 rows 4–6) + rate card v1 (blended
   rates) + exhaustiveness script (§7.3). Start accruing complete history
   immediately. **Step-by-step order in §9.1 — implementation starts there.**
2. **Phase 2 — Counters + reconcile + backstops.** `ai_usage_counters` +
   `record_usage_counter` + nightly rebuild/drift check against
   `ai_invocations` (also flags null-cost rows, unattributed rows, and
   unclosed `pending` session rows) + runtime backstops (§7.4: ALS context,
   instrumented fetch) + the monthly invoice-reconciliation habit (§7.5).
3. **Phase 3 — Limits + enforcement.** `ai_usage_limits` + `getQuotaStatus` /
   `assertWithinQuota` inside handle resolution + `QUOTA_EXCEEDED` taxonomy
   code + in-product messaging (institution and class).
4. **Phase 4 — Dashboards.** Super-admin (all), institution-admin (own),
   teacher (own class) usage views; limits editor. Mirror the `app_logs`
   viewer components/queries.
5. **Phase 5 — Billing export.** Per-period, per-institution (and per-class)
   invoice rollup (credits + USD); CSV/JSON or billing-provider integration.
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
`usageTypes.ts`, `rates.ts` (blended v1 rates for every live model,
`unpriced` markers for `coming_soon`, `RATE_VERSION = 'v1'`,
credits = `cost_usd × 100` per §10 #3), `computeUsage.ts`, and
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
`select usage_type, count(*), sum(cost_usd) from ai_invocations group by 1`
shows every surface, no null `institution_id` on class-scoped flows, no
null-cost rows for live models, and no lingering `pending` rows.

## 10. Decisions — adopted defaults

Every previously-open question now has a working default so implementation is
unblocked. Each is deliberately cheap to revise later (rate-version snapshots
+ rebuildable counters mean a policy change is a code edit, not a redesign).

| # | Decision | Adopted default | Changing it later |
| --- | --- | --- | --- |
| 1 | One table for audit + billing | Yes — `ai_invocations` wears both hats; the §6 split (row always-on, payloads flagged + detached) keeps the roles independent. | Split tables only if write load ever demands it. |
| 2 | RLS read exposure | Ship the three-tier row policy (§4.3) — rows carry ids/metrics/GCS paths, never prompt content. | Swap to `security definer` aggregate views with no schema change. |
| 3 | Credits formula | `credits = cost_usd × 100` (1 credit = $0.01 of provider cost), pinned as `RATE_VERSION 'v1'`. Margin/packaging is a finance decision that lands as a new rate version. | Repricing is forward-only; history is immutable by construction. |
| 4 | BYOK vs caps | BYOK usage (`ai_key_source in ('institution','class')`) is fully metered on rows but **skips the quota check and never hits the counters** — counters exist solely to enforce platform-paid caps (`platform`/`env`). | Counters are a rebuildable cache: policy edit + rebuild. |
| 5 | Retry credits | v1 charges credits for **every attempt** — retries are real provider cost. | `retry_index > 0` exclusion is a `computeUsage` flag. |
| 6 | Billing period | Calendar month, UTC: `period_start = (date_trunc('month', started_at at time zone 'utc'))::date`. | Institution-specific anchors live on `ai_usage_limits` later. |
| 7 | Turn-inline TTS granularity | One row per turn (WS session, or fallback-chunk roll-up). | Per-chunk rows only if invoice reconciliation demands them. |
| 8 | STT duration source | Provider-reported (`metric_source='provider'`) when available; else measured (Sarvam last-timestamp / server-derived); else client `recordingDurationMs` as `'estimated'`. Server-side audio decoding deferred. | Tighten if monthly reconciliation shows drift. |
| 9 | Gateway inversion | Adopted — Phase 1 does the inversion directly; the transitional required-`invocation`-param alternative is rejected (leaves raw models in circulation). | — |
| 10 | Metering durability | Best-effort detached writes + `app_logs` on every drop + Phase 2 nightly rebuild/drift check. | Upgrade to a transactional outbox if drift materializes. |
| 11 | Always-on write volume | Accepted — text rows already existed behind the flag; speech adds low-rate rows; §4.1 indexes are aggregation-first. | Partition/archive by month if volume grows. |
| 12 | OpenAI TTS token-billing mismatch | Meter `characters` + `audio_output_ms` as a flagged approximation; reconcile against the monthly invoice (that is what `metric_source` + `provider_request_id` exist for). | Add a token-estimate metric if reconciliation drifts. |

Still genuinely open (non-blocking): the real credit price / margin once
finance weighs in (lands as a new rate version), and whether teachers should
eventually see per-row usage or only aggregates (the #2 swap).

## 11. File map (to build)

Phase 1 (§9.1 step in parentheses):

- `supabase/migrations/20260713000000_ai_invocations_metering.sql` — extend
  columns, relax NOT NULL, backfill, indexes, RLS read policies (step 1).
- `src/lib/ai/metering/usageTypes.ts` — usage_type registry (§4.2) (step 2).
- `src/lib/ai/metering/rates.ts` — rate card (TS), `RATE_VERSION`, resolver
  with fallback chain + `unpriced` markers (step 2).
- `src/lib/ai/metering/computeUsage.ts` — raw metrics → `cost_usd` /
  `credits` (step 2).
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
  class_id) + `record_usage_counter` function (§4.5) (Phase 2).
- `supabase/migrations/*_ai_usage_limits.sql` — limits table (§4.6) (+
  optional `ai_usage_rates` if/when the rate card moves to DB) (Phase 3).
- `src/lib/ai/metering/quota.ts` — `getQuotaStatus` / `assertWithinQuota`
  (Phase 3).
- `src/lib/ai/errors.ts` — add `QUOTA_EXCEEDED` (non-retryable) (Phase 3).
- `src/lib/queries/aiUsage.ts` + admin/teacher usage pages & components
  (Phase 4).

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
