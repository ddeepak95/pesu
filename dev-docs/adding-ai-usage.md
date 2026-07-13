# Adding a new AI feature

Every AI call in this app must be metered — logged to `ai_invocations` with
enough detail to compute cost and credits. This is not opt-in: the **AI
gateway** (`src/lib/ai/gateway/`) is the only place allowed to hold provider
credentials or call the `ai` package / speech provider clients, so a new
feature structurally cannot skip metering. See
[`dev-docs/ai-usage-metering-plan.md`](./ai-usage-metering-plan.md) for the
full design; this is the short version for adding something new.

---

## Mental model

You never construct a raw model or provider client. You ask the gateway for a
**metered handle**, and the handle both executes the call and writes the
`ai_invocations` row.

```ts
import { resolveMeteredModel } from "@/lib/ai/gateway";

const handle = await resolveMeteredModel({
  appFunctionKey: "text.my_new_feature",
  context: { classDbId, assignmentId, submissionId, questionOrder },
});

const result = await handle.generateStructured({
  schema: mySchema,
  schemaName: "mySchema",
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ],
});
```

Speech works the same way via `resolveMeteredSpeech` (`src/lib/ai/gateway`),
returning a `MeteredSttClient` / `MeteredTtsClient`.

**Enforced, not just documented:** `eslint.config.mjs` blocks any import of
the `ai` package or `src/lib/konvo-voice/speech/{providers,registry,
resolveProviderKey}` from outside `src/lib/ai/gateway/**`, and
`scripts/validate-ai-metering.ts` (wired to `npm run prebuild`) re-checks the
same boundary at build time — lint alone doesn't gate this repo's build
(no CI), so the build-time check is what actually blocks a bad merge.

---

## Step-by-step

### 1. Pick or add a `usage_type`

`src/lib/ai/metering/usageTypes.ts` is the registry. Existing types:
`text_generation`, `speech_to_text`, `text_to_speech` (all live);
`realtime_dialogue`, `image_generation`, `video_generation`, `embedding`
(reserved). A text-based feature almost always reuses `text_generation` — you
don't need a new type unless you're adding a genuinely new modality.

If you *are* adding a new modality: add it to the `UsageType` union and
`USAGE_TYPE_REGISTRY`, then map the catalog's `ModelTask` to it in
`TASK_TO_USAGE_TYPE`. `assertCatalogUsageTypesComplete()` fails the build if
any catalog model task has no usage_type mapping.

### 2. Register the catalog function binding

If this is a new sub-function of an existing capability (e.g. another `text.*`
action), add it to `CATALOG_FUNCTIONS` in `src/lib/ai/catalog/data.ts` and the
`AppFunctionKey` union in `src/lib/ai/catalog/appFunctions.ts`. This is what
lets admins bind a specific model to your feature and what `resolveMeteredModel`
resolves against.

### 3. Add rate-card entries

`src/lib/ai/metering/rates.ts` — every `status: "available"` catalog model
must appear in the *current* rate version
(`RATE_CARD_VERSIONS[CURRENT_RATE_VERSION].entries`), either with real
per-metric `usdPerUnit` rates or an explicit `{ unpriced: true }` marker.
`coming_soon` models don't need an entry at all — leave them out entirely
until you're actually activating them, then add real rates as part of that
work. `assertRateCardComplete()` fails the build if an available model is
missing or a provider's entries aren't grouped together, so add your model
under its provider's block. New
usage_types add a new `RateMetric` if needed (see the `RateMetric` union) —
most reuse `input_token`/`output_token`. If a model accepts a modality whose
provider pricing genuinely diverges from the blended token rate (e.g. Gemini
audio input), give that metric its own entry instead of relying on the
fallback chain — see `gemini-3-flash-preview`'s `audio_input_token` for the
pattern.

**If the provider's price list isn't directly USD** (a prepaid-credit system
like Cartesia's, or a foreign currency like Sarvam's INR pricing), don't hand-
compute a blended `usdPerUnit` — use `nativeRate({ unit, nativeUnitsPerRawUnit,
usdPerNativeUnit, asOfDate, source })` instead. Split the two things that
actually vary independently: `nativeUnitsPerRawUnit` is the provider's own
fixed billing formula (a fact — e.g. 1 Cartesia credit per character) and
`usdPerNativeUnit` is the volatile conversion (which prepaid plan you're
actually on, or today's FX rate) — see `cartesia-sonic-3-5` / `sarvam-bulbul-
v3-tts`. This also makes the row's native cost (Cartesia credits, INR)
reconcilable directly against the provider's own invoice, independent of
whether the USD conversion is currently right.

**Repricing an existing model is never an in-place edit.** Copy the current
version's `entries` into a new key under `RATE_CARD_VERSIONS`, edit the copy,
and bump `CURRENT_RATE_VERSION` — the old version stays in the file
permanently, so any row's `rate_version` can still be resolved back to the
exact rates that priced it (§4.4 rule 4).

### 4. Obtain a metered handle — never a raw client or key

- **Text**: `resolveMeteredModel({ appFunctionKey, usageType?, context })` →
  `MeteredTextModel`. Call `.generateStructured(...)` (structured JSON output)
  or, inside the turn route, `.streamTurn(...)`.
- **Speech**: `resolveMeteredSpeech({ kind: "stt" | "tts", catalogEntry,
  assignmentId, context })` → `MeteredSttClient` / `MeteredTtsClient`.
  `MeteredTtsClient.openSynthesisSession(...)` covers streaming/continuation
  TTS (Cartesia/Sarvam); `.synthesize()` / `.synthesizeStream()` cover batch.

`context: AiCallContext` (`classDbId`, `assignmentId`, `submissionId`,
`questionOrder`, `attemptNumber`, `userId`, `relatedEntity`) is what attributes
the row to an institution/class/user and links it to a domain entity (e.g.
`{ type: "chat_message_action", id: actionId }`). Fill in what you have at
resolution time — the context object is held by reference, so a field
resolved later (e.g. an attempt number only known after a DB write) can still
be set on the same object before the handle is actually called.

Every provider attempt is logged automatically:

- Text generation retries → one row per attempt (`retry_of`/`retry_index`
  chain) — provider-cost accurate.
- Speech retries (`withRetry` inside the gateway) → one row per logical
  operation, not per attempt.

You never call `startAiInvocation`/`completeAiInvocation` yourself — that's
gateway-internal.

### 5. Validate

```
npm run validate:ai-metering
```

Runs the same three checks as the build's `prebuild` hook: catalog ↔
usage_type completeness, catalog ↔ rate-card completeness, and the gateway
import boundary. Fix whatever it flags before opening a PR.

---

## Adding a genuinely new modality (rare)

If your feature needs something the gateway doesn't wrap yet (e.g.
`embed()`, `generateImage()`), you must add a funnel *inside*
`src/lib/ai/gateway/` — the import-boundary rule means you have no other
choice, which is exactly the review checkpoint this is meant to force. Follow
the shape of `model.ts` (text) or `speech.ts` (speech): resolve credentials
once, wrap the SDK call, write the `ai_invocations` row via
`startAiInvocation`/`completeAiInvocation`/`failAiInvocation`
(`src/lib/ai/logging/recordInvocation.ts`), and expose only a metered handle
from `src/lib/ai/gateway/index.ts`.
