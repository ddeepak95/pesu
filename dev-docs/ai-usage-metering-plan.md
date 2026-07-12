# AI Usage Metering Plan

Status: **PLAN — not started.** Written 2026-07-12. Revised 2026-07-12 to make
`ai_invocations` the single universal AI-usage record and to add **class-level**
tracking.

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

"Holistic" is the hard requirement: **every AI modality** — text LLM, STT, TTS,
and future realtime — must be captured, at **both** institution and class grain.

## 2. Direction (what changed)

The earlier draft proposed a *separate* `ai_usage_events` ledger alongside
`ai_invocations`. Per the new requirement, we instead **make `ai_invocations`
itself the single universal record for ALL AI calls** — text and speech and
realtime — and build the metering/limits layer directly on top of it. One table =
"every AI call is exactly one row." No dual-write, no cross-table reconciliation.

Two structural changes make this work:

1. **Extend `ai_invocations`** with modality-agnostic metrics (audio ms,
   characters), a `usage_type` discriminator, denormalized `institution_id`, and
   snapshotted `cost_usd` / `credits` (§4).
2. **Decouple the always-on billing record from the debug payload.** Today the
   whole thing is gated behind `AI_INVOCATION_LOGGING_ENABLED` (which also drives
   heavy GCS request/response uploads). We split these: the **row is always
   written** (it's now a system of record), while **GCS payload capture stays
   behind the flag** (debug/audit only). See §6.

Everything downstream (counters, rates, limits, dashboards) reads from
`ai_invocations`.

## 3. What we have today (and the gaps)

`ai_invocations` currently records **text-generation LLM calls only**, one row per
*attempt* (with `retry_of` / `retry_index` chaining). Columns of note:
`app_function_key`, `ai_provider`, `ai_model_id`, `ai_key_source`, `class_id`,
`assignment_id` (text), `submission_id` (text), `question_order`,
`attempt_number`, `prompt_tokens` / `completion_tokens` / `total_tokens`,
`duration_ms`, `status` (pending/completed/failed), `request_storage_path`
**(NOT NULL)** + `response_storage_path` (GCS), `retry_of`, `retry_index`.
Written by `generateStructured` (`structured.ts`) and the multimodal turn route.
Service-role only (RLS enabled, **no read policies** → effectively service-only).
Gated entirely by `AI_INVOCATION_LOGGING_ENABLED`.

| Gap for holistic metering | Fix (this plan) |
| --- | --- |
| **Text only** — STT / TTS / realtime record nothing (transcribe & tts routes call providers directly with zero logging). | Add `usage_type` + audio/character metrics; emit rows from the STT/TTS routes (§5). |
| **Token-only metrics** — no audio-seconds (STT/realtime billing unit) or characters (TTS billing unit). | Add `audio_ms`, `characters`, `audio_output_ms` columns (§4). |
| **`request_storage_path` NOT NULL** — speech calls have no meaningful GCS request payload. | Make nullable; set only when payload capture runs (§6). |
| **Gated by a debug flag** — metering must be always-on. | Split row (always-on) from payload upload (flagged) (§6). |
| **No institution scoping / no RLS reads** — can't attribute to a customer or expose to admins. | Denormalize `institution_id`; add class/institution/super-admin read policies (§4.3). |
| **No cost/price** — nothing maps raw units → money/credits. | Add `cost_usd`, `credits`, `rate_version` snapshot columns + a rate card (§4.4). |
| **Summing raw rows is too slow for a pre-flight quota gate.** | Add `ai_usage_counters` rollup (§4.5). |

Assets we already have and will lean on:
- **Model catalog** (`src/lib/ai/catalog/data.ts`) classifies every model by
  `modelClass` / `tasks` / provider / `apiModelId` — the backbone for `usage_type`
  and the rate card.
- **Class-ownership + admin RLS helpers** already exist: `is_class_owner`,
  `is_class_co_teacher`, `is_class_teacher_admin`, `is_class_institution_admin`,
  `is_institution_admin`, `is_platform_super_admin` — enough for class- and
  institution-level read policies with no new plumbing.
- **`ai_key_source`** already distinguishes platform vs institution/class BYOK
  keys — essential for who bears provider cost / whether we charge.
- **`app_logs` + `logAppEvent`** — the institution-denormalization, service-role
  fire-and-forget, and RLS patterns to copy; also the sink for metering-write
  failures.

## 4. Schema changes

### 4.1 Extend `ai_invocations` (the universal record)

```sql
alter table public.ai_invocations
  -- modality discriminator (backfill existing rows to 'text_generation')
  add column usage_type text not null default 'text_generation',
      -- 'text_generation' | 'speech_to_text' | 'text_to_speech' | 'realtime_dialogue'

  -- non-token metrics (null unless the modality applies)
  add column audio_ms         integer,   -- STT input duration / realtime session seconds
  add column characters        integer,   -- TTS input characters
  add column audio_output_ms   integer,   -- TTS synthesized duration (optional)
  add column metric_source     text,      -- 'provider' | 'measured' (speech; see §5.1)

  -- billing snapshots (computed at write time from the rate card)
  add column institution_id  uuid references public.institutions(id) on delete set null,
  add column cost_usd        numeric(12,6),
  add column credits         numeric(14,4),
  add column rate_version    text;

-- speech rows have no GCS request payload
alter table public.ai_invocations alter column request_storage_path drop not null;

-- backfill institution_id from class_id for existing rows
update public.ai_invocations i
  set institution_id = c.institution_id
  from public.classes c
  where i.class_id = c.id and i.institution_id is null;
```

New indexes for aggregation / limit reads:

```sql
create index ai_invocations_inst_time_idx
  on public.ai_invocations (institution_id, started_at desc) where institution_id is not null;
create index ai_invocations_inst_type_time_idx
  on public.ai_invocations (institution_id, usage_type, started_at desc) where institution_id is not null;
create index ai_invocations_class_time_idx
  on public.ai_invocations (class_id, started_at desc) where class_id is not null;
```

`class_id` is already present and FK'd — **class-level attribution is essentially
free** once `institution_id` is denormalized alongside it.

### 4.2 Status vocabulary for non-text rows

Speech/realtime reuse `status` (`pending`/`completed`/`failed`). For a streaming
TTS call, insert `pending` at synth start (background, non-blocking) and flip to
`completed` with metrics when the stream closes — mirroring
`scheduleAiInvocationStart` → `completeAiInvocation`.

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

(Note: rows carry GCS *paths* + prompt token counts but not prompt *content*, so
exposing the row to class teachers does not leak transcripts. If that's still too
much, expose dashboards through a `security definer` aggregate view instead and
keep the base table service-only — decide in §9.)

### 4.4 `ai_usage_rates` — pricing / rate card (versioned)

Maps `(provider, model, usage_type, metric)` → USD **and** credits per unit,
effective-dated. Recommended to start as **typed TS config**
(`src/lib/ai/metering/rates.ts`, keyed off the catalog, versioned by a
`RATE_VERSION` constant) — fast, testable, colocated — and migrate to a DB table
only when finance needs runtime edits.

```
metric ∈ 'input_token' | 'output_token' | 'audio_second' | 'character' | 'session_second'
rate  = { usdPerUnit, creditsPerUnit }
```

The write path resolves the rate and **snapshots** `cost_usd` + `credits` +
`rate_version` onto the row, so historical bills never change when we reprice.

### 4.5 `ai_usage_counters` — fast enforcement at class + institution grain

Summing `ai_invocations` on every call is too slow for a pre-flight gate. Maintain
incrementally-updated rollups keyed to **both** grains in one table:

```sql
create table public.ai_usage_counters (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  class_id       uuid references public.classes(id) on delete cascade,  -- null = institution-wide rollup
  period_start   date not null,          -- billing bucket (e.g. month start)
  usage_type     text not null,          -- or 'all' for a cross-modality total
  credits        numeric(14,4) not null default 0,
  cost_usd       numeric(12,6) not null default 0,
  events         bigint not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (institution_id, class_id, period_start, usage_type)
);
```

Postgres treats `null` PK parts specially, so the `class_id is null` rollup is
maintained via an explicit convention: on each event, upsert up to four rows —
`(inst, class, usage_type)`, `(inst, class, 'all')`, `(inst, NULL, usage_type)`,
`(inst, NULL, 'all')` — each `on conflict do update set credits = credits +
excluded.credits, …` (atomic). A `record_usage_counter` SQL function encapsulates
the four upserts. Counters are a pure cache of `ai_invocations` → **rebuildable**
by re-aggregating the base table (nightly reconcile, §8).

- **Institution total** (O(1) limit read): `(inst, NULL, 'all')`.
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

Enforcement checks the **most specific** applicable limit (class limit if present,
else institution limit).

## 5. The write path — one `recordUsage()` funnel over the invocation lifecycle

Rather than a second helper, fold metering into the **existing invocation
lifecycle** (`startAiInvocation` / `scheduleAiInvocationStart` /
`completeAiInvocation` / `failAiInvocation`), since that already runs for text and
is the natural home for speech too. `completeAiInvocation` gains the job of:

1. Resolving `institution_id` from `class_id` (reuse `resolveInstitutionId` from
   `appLog.ts`).
2. Resolving the rate for `(provider, model, usage_type)` at `RATE_VERSION`.
3. Computing + writing `cost_usd`, `credits`, `rate_version` onto the row (in the
   same `update` that writes metrics).
4. Calling `record_usage_counter(...)` (the four atomic upserts).
5. On failure of any metering step, `logAppEvent({ level:'error',
   source:'usage_metering' })` so drops are visible.

All non-blocking (detached), so it never delays time-to-first-token or a response.

### Emission sites — five funnels cover 100% of usage

| Site | usage_type | Metrics | Notes |
| --- | --- | --- | --- |
| `generateStructured` (`structured.ts`) | `text_generation` | tokens (already captured) | Covers evaluation, rubric gen, MCQ, dynamic questions, transliteration, suggested-response. Already logs each attempt → retry rows already exist. New action kinds inherit this for free. |
| Multimodal turn route (`streamObject`) | `text_generation` | tokens from the usage promise | Already computes usage for the row; just add metering fields. |
| `/api/multimodal/transcribe` | `speech_to_text` | `audio_ms` (prefer server-derived from the audio buffer; fall back to client `recordingDurationMs`) | **One row per `stt.transcribe` call.** Dual-language mode = 2 calls on the same audio = 2 rows (both are real cost). Chunked Sarvam = one row per chunk. Needs `class_id`/`submission_id` context plumbed in — see below. |
| `/api/multimodal/tts` | `text_to_speech` | `characters = text.trim().length` (+ optional `audio_output_ms` from streamed bytes ÷ sampleRate) | Character count is deterministic + provider-aligned; capture at synth start, finalize on stream close. |
| Realtime (future) | `realtime_dialogue` | `audio_ms` = session seconds | Emit on session close; heartbeat partials for long sessions. |

**Context plumbing for STT/TTS:** the transcribe/tts routes currently receive only
`assignmentId`. To attribute usage to a class and institution they need
`class_id` (+ ideally `submission_id`). Two options: (a) resolve `class_id` from
the assignment server-side, or (b) have the client pass `classId`/`submissionId`
(the turn route already has them client-side). Recommend (a) for a trustworthy
source of truth, cached per assignment. This is the main net-new wiring for
speech metering.

**Speech invocation model meta:** derive `provider` / `apiModelId` from the
catalog entry the routes already resolve; `ai_key_source` from
`resolveProviderApiKeyForAssignment` (platform vs assignment BYOK key).

**Retries & internal withRetry:** text already logs each attempt (provider-cost
accurate). STT/TTS use an *internal* `withRetry(…, 3)` that is not currently
surfaced as separate rows — v1 logs **one row per logical operation**; flag the
per-attempt gap for later. `retry_index > 0` rows can be **excluded from customer
credits** while still counting toward `cost_usd` (policy flag; columns ready).

### 5.1 Provider usage capture — verified against official docs (2026-07-12)

For **text**, the AI SDK already normalizes provider `usage` (tokens) onto the
result — authoritative, already captured. For **speech**, the picture is
provider-specific. The table below is verified against each provider's official
API reference / pricing (sources at the end of this section). **The current
wrappers (`speech/types.ts`: `TranscribeResult = { text }`,
`SynthesizeResult = { audio, mimeType }`) discard everything else — this is what
we extend.**

#### STT — capture provider-reported metrics; the response *does* carry them (except Sarvam)

| Provider (model) | Response carries | Billing basis | Capture strategy | `metric_source` |
| --- | --- | --- | --- | --- |
| **OpenAI** `gpt-4o-mini-transcribe` | **`usage` object** — `type:"tokens"` with `input_tokens`, `input_token_details.{audio_tokens,text_tokens}`, `output_tokens`, `total_tokens` (default JSON includes it). `whisper-1` instead returns `type:"duration"` `{seconds}`. | Token-based (mini/4o-transcribe); duration-based (whisper-1). | Pass through `result.usage` verbatim into `TranscribeResult.usage.raw`; map tokens → normalized, or `seconds`→`audio_ms`. | `provider` |
| **Cartesia** `ink-whisper` | `text`, `request_id`, `language`, **`duration` (audio seconds)**, optional `words[]`. No token/credit field. | Per audio-minute (1 credit/sec of audio, drawn from plan). | Parse `body.duration` → `audio_ms`. | `provider` |
| **Sarvam** `saaras:v3` | `request_id`, `transcript`, `language_code`, `language_probability`, optional `timestamps` (word start/end), `diarized_transcript` (batch). **No duration, no usage.** | ₹30 / hour of audio. | **Self-measure.** Best: request `timestamps` and take the last word's `end` as audio length; else fall back to client `recordingDurationMs`; server-side decode later if drift matters. | `measured` |

So STT genuinely benefits from wrapper changes: **OpenAI and Cartesia hand us
authoritative usage/duration we currently throw away.** Only Sarvam must be
self-measured.

#### TTS — no provider returns usage in the response; measure at the route

Verified: **OpenAI, Cartesia, and Sarvam all return only audio** (a byte stream /
base64), with **no usage object**. So there is nothing to "capture from the
response" — the wrapper/route must compute the billable metric from inputs/outputs:

| Provider (model) | Billing basis (verified) | Metric we record |
| --- | --- | --- |
| **OpenAI** `gpt-4o-mini-tts` | **Token-based** — text input tokens ($0.60/1M) **+ audio output tokens ($12/1M)**, *not* characters. | `characters` (proxy for input) **+ `audio_output_ms`** (proxy for output tokens). Flag as an **approximation** — exact tokens aren't in the response. |
| **Cartesia** `sonic-3.5` | **1 credit / character** (deterministic from input). | `characters` — exact. |
| **Sarvam** `bulbul:v3` | Per character. | `characters` — exact. |

Because the tts route already holds the input `text` (→ characters) and sums
streamed bytes (→ `audio_output_ms = bytes ÷ (sampleRate × bytesPerSample)`, exact
for the raw-PCM providers Cartesia/Sarvam), **TTS needs no wrapper change** — it is
measured at the route. Note `synthesizeStream` is an `AsyncIterable<Uint8Array>`
that yields only audio; threading usage back through it would require changing its
contract, which the route-level measurement avoids. The one caveat is OpenAI's
token billing: our character/duration metric is a *standard-rate approximation*,
reconciled against OpenAI's monthly invoice — acceptable given the standard-rate
model (§4.4), and improvable later if a tokenizer estimate is warranted.

#### Concrete changes

1. **`speech/types.ts`** — add a shared usage shape and thread it through STT:

   ```ts
   export interface SpeechUsage {
     audioMs?: number | null;          // STT input duration / TTS output duration
     characters?: number | null;       // TTS input chars
     providerTokens?: { input?: number; output?: number; audio?: number } | null;
     source: "provider" | "measured";  // honest provenance → event.metric_source
     raw?: unknown;                     // provider usage/duration blob, for reconciliation
   }
   export interface TranscribeResult { text: string; usage?: SpeechUsage }
   // SynthesizeResult unchanged; TTS usage is computed at the route.
   ```

2. **STT wrappers** — populate `usage`:
   - `openai/stt.ts`: forward `result.usage` (tokens or duration variant) into
     `usage.raw` + normalized fields; `source:"provider"`.
   - `cartesia/stt.ts`: parse `body.duration` → `usage.audioMs`; `source:"provider"`.
   - `sarvam/stt.ts`: optionally request `timestamps` and derive `audioMs` from the
     last word's `end`; else leave `usage` undefined so the route self-measures.

3. **transcribe route** — record `usage.audioMs` when the wrapper supplied it, else
   fall back to a measured duration; set the event's `metric_source` accordingly.
   Remember: dual-language = 2 `transcribe` calls = 2 usage rows.

4. **tts route** — compute `characters` from `text.trim().length` and
   `audio_output_ms` from the summed byte total ÷ sample rate; write one row per
   synth. No wrapper change.

5. **`metric_source` column** — add to `ai_invocations` (§4.1) so every speech row
   records whether its quantity was provider-reported or self-measured, making
   invoice reconciliation auditable.

**Sources:** OpenAI [Create transcription](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)
+ [gpt-4o-mini-tts model/pricing](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts);
Cartesia [Batch STT](https://docs.cartesia.ai/api-reference/stt/transcribe)
+ [pricing](https://docs.cartesia.ai/pricing);
Sarvam [STT REST](https://docs.sarvam.ai/api-reference-docs/speech-to-text/transcribe)
+ [pricing](https://www.sarvam.ai/api-pricing). Verified 2026-07-12.

### 5.2 Multimodal LLM usage (audio / image input, cached & reasoning tokens)

"Multimodal LLM" here means a **single generative call that ingests non-text
input** — e.g. `gemini-3-flash-preview` (`audio_input`; the catalog notes it
accepts an inline audio part on the same `streamObject` / chat_completions surface
as text tutoring), or the image-capable foundation models (`gpt-5.4`, `gpt-4o`,
`gemini-2.5-pro`). This is **distinct from the STT/TTS pipeline** (§5.1) and from
realtime (`realtime_dialogue`, separate Live surface).

**The good news: coverage is already automatic.** A multimodal call is still one
`text_generation` invocation through `generateStructured` / the turn route, and
the provider **folds image/audio input into the top-line token counts** — so the
`inputTokens` / `outputTokens` we already capture *already include* the multimodal
content. No new emission site, no new `usage_type`. A learner's audio fed straight
into the LLM (instead of STT→text) shows up as input tokens on that one row.

**The catch: modalities and token classes are priced differently**, so a single
blended per-input-token rate mis-prices multimodal-heavy calls. Verified against
the Gemini API, `usageMetadata` breaks a single call's tokens into:

- `promptTokensDetails` / `candidatesTokensDetails` — **per-modality**
  `ModalityTokenCount` (TEXT / IMAGE / AUDIO / VIDEO). Audio and image input tokens
  are priced higher than text tokens.
- `cachedContentTokenCount` (+ `cacheTokensDetails`) — cached input, **~75%
  cheaper**. This is the same lever as the §4.4 "cached-input future provision" —
  it lives here, not in STT/TTS.
- `thoughtsTokenCount` — **reasoning/thinking tokens**, billed as output. Material
  for us because the app drives Gemini `thinkingLevel` and OpenAI reasoning effort.

OpenAI mirrors this with `usage.input_tokens_details` / `output_tokens_details`
(`cached_tokens`, `audio_tokens`, `reasoning_tokens`). The AI SDK surfaces the
cross-provider ones on `usage` (`reasoningTokens`, `cachedInputTokens`) and the
full per-modality breakdown under `providerMetadata` (Google `usageMetadata`).

**Recommendation — capture the breakdown now, price blended now.** Consistent with
the "standard price now, provisions for later" stance:

1. **Store the raw breakdown from day one** even while billing at a blended
   standard rate — because raw metrics can never be recovered retroactively, but a
   reprice/backfill is trivial if we kept them (§4.4 fail-safe principle). Add to
   `ai_invocations`:

   ```sql
   add column cached_input_tokens integer,   -- cachedContentTokenCount / cached_tokens
   add column reasoning_tokens     integer,   -- thoughtsTokenCount / reasoning_tokens
   add column token_details        jsonb;     -- per-modality ModalityTokenCount blob
   ```

2. **Rate card gains optional per-token-class metrics** — extend the §4.4 `metric`
   set with `audio_input_token`, `image_input_token`, `cached_input_token`,
   `reasoning_token`. When a model+metric rate is absent, fall back to the blended
   `input_token` / `output_token` rate (so v1 with only blended rates is correct;
   refinement is additive, no schema change).

3. **Wiring:** in `structured.ts` and the turn route, read `providerMetadata`
   alongside `result.usage`, normalize into the columns above. This is the *only*
   net-new capture work for multimodal LLMs — everything else already flows.

**Output modalities** (image generation, audio-out) are all text today. When an
image-generation action or audio-out ships, add an output-modality metric /
`usage_type` then; Gemini Live audio-out is metered as `realtime_dialogue`
(session-based), already reserved.

**Sources:** Gemini [ModalityTokenCount](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/v1/ModalityTokenCount)
+ [GenerateContentResponse.UsageMetadata](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1/GenerateContentResponse)
+ [Counting tokens](https://ai.google.dev/api/tokens); Vercel AI SDK
[Google provider / reasoning](https://ai-sdk.dev/v5/providers/ai-sdk-providers/google-generative-ai).
Verified 2026-07-12.

## 6. Decoupling always-on billing from debug payloads

`isAiInvocationLoggingEnabled()` currently gates the entire lifecycle. Split it:

- **Row lifecycle → always on.** `startAiInvocation` / `scheduleAiInvocationStart`
  always insert; `complete/fail` always update + meter. Remove the early
  `return null` disable path from the row writes.
- **GCS payload capture → keep the flag** (rename conceptually to
  `AI_INVOCATION_PAYLOAD_CAPTURE`). Only `uploadInvocationJson` calls are gated;
  `request_storage_path` / `response_storage_path` stay null when disabled (now
  legal — see §4.1).

This preserves the heavy/PII-sensitive debug capture as opt-in while making the
billing record unconditional.

## 7. Read path — limits & enforcement (institution + class)

`getQuotaStatus({ institutionId, classId })` / `assertWithinQuota(...)`:

1. Look up the most specific `ai_usage_limits` row (class → institution).
2. Read the matching `ai_usage_counters` total (`(inst, class, 'all')` or
   `(inst, NULL, 'all')`) — one indexed PK lookup, no aggregation.
3. Apply `enforcement`:
   - `off` → allow.
   - `warn` → allow; if over `soft_warn_credits`, surface a banner / notify admins
     (`logAppEvent`) / email.
   - `block` → if projected usage would exceed `hard_cap_credits`, **reject before
     the model call** with a new `quota_exceeded` code added to the
     `src/lib/ai/errors.ts` taxonomy, so it flows through the existing
     retry/error surfacing as a clear message (not a generic failure).

Placement: a shared guard at the top of each AI route/handler (after auth, before
dispatch). Streaming turns check once at turn start.

Policy decisions to confirm (§9): BYOK (`ai_key_source != 'platform'`) usage is
metered but likely **not** enforced against platform credit caps; a small cap
overshoot from in-flight concurrency is acceptable for v1.

## 8. Phasing

1. **Phase 1 — Extend + universal capture (no enforcement).** Migration (§4.1–4.3)
   + decouple flag (§6) + wire all five emission sites with metrics, `usage_type`,
   `institution_id`, and cost/credits snapshots. Start accruing complete history
   immediately.
2. **Phase 2 — Counters + reconcile.** `ai_usage_counters` + `record_usage_counter`
   + nightly rebuild/drift check against `ai_invocations`.
3. **Phase 3 — Limits + enforcement.** `ai_usage_limits` + `getQuotaStatus` guard +
   `quota_exceeded` taxonomy + in-product messaging (institution and class).
4. **Phase 4 — Dashboards.** Super-admin (all), institution-admin (own),
   **teacher (own class)** usage views; limits editor. Mirror the `app_logs`
   viewer components/queries.
5. **Phase 5 — Billing export.** Per-period, per-institution (and per-class)
   invoice rollup (credits + USD); CSV/JSON or billing-provider integration.
6. **Later — realtime metering** when `realtime_dialogue` ships; **rate table in
   DB** if finance needs runtime repricing; **per-attempt speech rows** if
   provider-cost fidelity on STT/TTS retries matters.

## 9. Open questions / risks

- **Overloading `ai_invocations`** — it now serves debug audit *and* billing
  system-of-record. Mitigated by the §6 split (row always-on, payload flagged) and
  §4.1 nullable payload paths. Confirm we're comfortable with one table wearing
  both hats.
- **RLS exposure** — is per-row read access for class teachers acceptable, or
  should dashboards go through a `security definer` aggregate view keeping the base
  table service-only? (§4.3)
- **Credits formula & pricing / margin** — needs product/finance input; schema
  supports any mapping.
- **Durability vs latency** — metering writes are non-blocking best-effort with
  error logging on drop. If under-metering is unacceptable, upgrade to an outbox
  written in the same txn as the related DB write.
- **STT quantity fidelity** — prefer server-derived audio duration over the
  spoofable client `recordingDurationMs`.
- **STT/TTS context plumbing** — resolve `class_id`/`submission_id` from the
  assignment vs trust client-supplied values (§5).
- **BYOK charging policy** and **retry-credit policy** — confirm (schema flags
  ready for both).
- **Period definition** — calendar month vs institution-specific billing anchor.
- **Always-on cost** — every AI call now writes ≥1 row unconditionally; confirm
  volume/write-load is fine (indexes in §4.1 are aggregation-first; row writes are
  already happening for text).

## 10. File map (to build)

- `supabase/migrations/*_ai_invocations_metering.sql` — extend columns, relax
  NOT NULL, backfill, indexes, RLS read policies.
- `supabase/migrations/*_ai_usage_counters.sql` — counter table +
  `record_usage_counter` function.
- `supabase/migrations/*_ai_usage_limits.sql` — limits (+ optional `ai_usage_rates`).
- `src/lib/ai/metering/rates.ts` — rate card (TS), `RATE_VERSION`, resolver.
- `src/lib/ai/metering/computeUsage.ts` — raw metrics → `cost_usd` / `credits`.
- `src/lib/ai/metering/quota.ts` — `getQuotaStatus` / `assertWithinQuota`.
- `src/lib/ai/logging/recordInvocation.ts` — thread institution/metrics/cost +
  counter upsert into `complete/fail`; decouple the always-on row from payload
  capture (§6).
- `src/lib/ai/logging/enabled.ts` — split into row (always-on) vs payload flag.
- `src/lib/ai/logging/types.ts` — add `usageType` + speech metric fields to the
  invocation input types.
- `src/lib/ai/errors.ts` — add `quota_exceeded`.
- Emission wiring: `structured.ts`, multimodal `turn/route.ts`,
  `transcribe/route.ts`, `tts/route.ts` (latter two also plumb class/submission
  context).
- `src/lib/queries/aiUsage.ts` + admin/teacher usage pages & components (Phase 4).

## 11. Relationship to existing systems

- **`ai_invocations`** — promoted from "text debug audit" to **the universal
  system of record for every AI call**, all modalities, always-on for the row.
  Debug GCS payloads remain opt-in. See
  `dev-docs/ai-retry-and-failure-recovery-plan.md` for the retry/error taxonomy it
  already participates in.
- **`app_logs`** — metering reuses its institution-denormalization + service-role
  fire-and-forget + RLS patterns, and is the sink for metering-write failures.
- **Model catalog** (`src/lib/ai/catalog/data.ts`) — source of truth for
  provider/model/modality that `usage_type` and the rate card derive from.
- **Class/institution RLS helpers** (`is_class_teacher_admin`,
  `is_institution_admin`, `is_platform_super_admin`) — power the three-tier read
  policy with no new auth plumbing.
```
