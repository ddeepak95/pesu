# Plan: Add ElevenLabs TTS Support

Add ElevenLabs as a fourth Text-to-Speech provider alongside the existing
Cartesia, OpenAI, and Sarvam TTS. ElevenLabs is **TTS-only** in this scope (no
STT / realtime). After this work, an admin can pick an ElevenLabs model for the
`text_to_speech` function in the AI settings UI (platform / institution / class
scopes), and the multimodal `/api/multimodal/tts` route will stream ElevenLabs
audio through the existing PCM pipeline.

> Read alongside `dev-docs/model-selection.md` (catalog resolution chain) and
> `dev-docs/language-support.md` (locale capabilities).

---

## 1. How TTS works today (context)

A TTS request flows through three layers:

```
/api/multimodal/tts  (route.ts)
  ├─ getCatalogEntry(ttsModelId)            → ModelCatalogEntry (data.ts)
  ├─ resolveProviderApiKeyForAssignment()   → DB-stored key for entry.providerId
  ├─ isProviderConfigured(providerId)       → env-var fallback (sessionCatalog.ts)
  ├─ resolveTtsVoice(ttsModelId, language)  → voice id (speechModelLocales.ts)
  └─ getTtsProvider(ttsModelId)             → TtsProvider impl (registry.ts)
        └─ provider.synthesizeStream(input) → PCM/L16 chunks → SSE base64
```

Model selection (which TTS model a class uses) is resolved separately by
`resolveMultimodalSpeechModelsForClass`, gated on the model being `available`
**and** the provider having a key (DB or env).

The audio contract the streaming player expects is **raw PCM `audio/L16;rate=24000`**
(`streamFormat.mimeType` / `sampleRate`). OpenAI and Cartesia both emit this;
Sarvam emits `audio/wav`. ElevenLabs can emit `pcm_24000`, so it slots cleanly
into the existing 24 kHz PCM path.

### Key catalog concepts

- **`ProviderId`** (`src/lib/ai/catalog/types.ts`) — union of provider ids. Must
  add `"elevenlabs"`.
- **`SpeechProviderId`** (`speech/types.ts`) — narrower union for speech-capable
  providers. Must add `"elevenlabs"`.
- **`CATALOG_MODELS`** (`catalog/data.ts`) — registry rows; each TTS model has an
  `apiModelId`, `tasks: ["text_to_speech"]`, `apiSurface: "synthesize"`.
- **`KONVO_TTS_MODEL_VOICES`** (`speechModelLocales.ts`) — per-`(model, locale)`
  default voice id. Presence of a locale key = model supports that locale.

---

## 2. ElevenLabs API summary

- **Auth:** header `xi-api-key: <key>` (not Bearer).
- **Synthesis (streaming):**
  `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream?output_format=pcm_24000`
  Body: `{ text, model_id, language_code?, voice_settings? }`.
  With `output_format=pcm_24000` the response body is **raw 24 kHz 16-bit LE mono
  PCM** — identical framing to OpenAI/Cartesia, so it reuses the L16 mime.
- **Models (`model_id`):**
  - `eleven_v3` — latest, most expressive/multilingual (70+ languages). Highest
    quality; higher latency. **Recommended default "latest model".**
  - `eleven_flash_v2_5` — ~75 ms latency, 32 languages; best for realtime.
  - `eleven_turbo_v2_5` — low latency, balanced quality.
  - `eleven_multilingual_v2` — stable, 29 languages.
- **Voices:** `voice_id` is **global and language-agnostic** for multilingual
  models — one voice speaks any supported language; the `model_id` (and optional
  `language_code`) drives the language. So our locale→voice map can use a small
  set of default voices reused across locales (unlike Cartesia, which has a
  distinct voice id per locale).
- **Language code:** ISO 639-1 (e.g. `en`, `hi`, `es`) via optional
  `language_code` to enforce a language; otherwise auto-detected.

> Confirm the exact "latest" `model_id` and a default `voice_id` against the
> current ElevenLabs docs before merging — model names and the public voice
> library change. Pin choices in `constants.ts` (Section 3.3).

---

## 3. Implementation

### 3.1 Widen the provider unions

**`src/lib/ai/catalog/types.ts`**
```ts
export type ProviderId = "google" | "openai" | "cartesia" | "sarvam" | "elevenlabs";
```

**`src/lib/konvo-voice/speech/types.ts`**
```ts
export type SpeechProviderId = "openai" | "cartesia" | "sarvam" | "elevenlabs";
```

Widening `ProviderId` makes the existing **exhaustive switches fail to compile**,
which is the checklist of touch points:
- `sessionCatalog.ts › isProviderConfigured` — add an `elevenlabs` case (Section 3.5).
- `speech/registry.ts › speechProviderId` — add `elevenlabs` to the guard.
- `src/lib/ai/provider.ts › getLanguageModel` — **no change needed**; it already
  throws for non-text providers and ElevenLabs is speech-only. (Leave the
  `default`/throw as-is.)

`getProviderApiKey` / `resolveProviderApiKeyForAssignment` are keyed generically
by `ProviderId` (record lookup), so they need **no** code change — only a key in
the DB or env.

### 3.2 Register the provider (catalog data)

**`src/lib/ai/catalog/data.ts`**

Add to `CATALOG_PROVIDER_IDS`:
```ts
export const CATALOG_PROVIDER_IDS = ["google", "openai", "cartesia", "sarvam", "elevenlabs"] as const;
```

Add to `CATALOG_PROVIDERS`:
```ts
{
  id: "elevenlabs",
  label: "ElevenLabs",
  description: "Eleven v3 and Flash TTS for expressive, multilingual speech.",
  activationLabel: "API key",
},
```

Add the model row(s) to `CATALOG_MODELS` (start with one; add Flash as a second
selectable option if desired):
```ts
{
  id: "elevenlabs-eleven-v3",
  providerId: "elevenlabs",
  label: "ElevenLabs Eleven v3",
  modelClass: "speech",
  tasks: ["text_to_speech"],
  io: { inputs: ["text"], outputs: ["audio"] },
  status: "available",
  apiSurface: "synthesize",
  apiModelId: "eleven_v3",
  supportedLanguageCodes: buildCatalogLocaleCodesFromCapabilities(
    "elevenlabs-eleven-v3",
    "text_to_speech",
  ),
},
```

### 3.3 Provider client + constants

**`src/lib/konvo-voice/speech/providers/elevenlabs/constants.ts`**
```ts
export const ELEVENLABS_API_BASE = "https://api.elevenlabs.io";
export const ELEVENLABS_TTS_SAMPLE_RATE = 24000;
export const ELEVENLABS_TTS_MIME = "audio/L16;rate=24000";
export const ELEVENLABS_DEFAULT_MODEL = "eleven_v3";
/** Default global voice id (multilingual). Confirm against ElevenLabs voice library. */
export const ELEVENLABS_DEFAULT_VOICE_ID = "<voice_id>";
```

**`src/lib/konvo-voice/speech/providers/elevenlabs/client.ts`** (mirror cartesia/client.ts)
```ts
import "server-only";
import { ELEVENLABS_API_BASE } from "./constants";
export { ELEVENLABS_API_BASE };

export function getElevenLabsApiKey(overrideApiKey?: string): string {
  const key = (overrideApiKey ?? process.env.ELEVENLABS_API_KEY)?.trim();
  if (!key) {
    throw new Error(
      "ELEVENLABS_API_KEY is not set. Add it to your local .env.local for ElevenLabs speech.",
    );
  }
  return key;
}

export function elevenLabsHeaders(overrideApiKey?: string): HeadersInit {
  return { "xi-api-key": getElevenLabsApiKey(overrideApiKey) };
}
```

### 3.4 TTS provider implementation

**`src/lib/konvo-voice/speech/providers/elevenlabs/tts.ts`** (mirror cartesia/tts.ts)
```ts
import "server-only";
import { getProviderLanguageCodeForKonvo } from "@/lib/konvo-voice/konvoLocaleCapabilitiesHelpers";
import type { SynthesizeInput, TtsProvider } from "../../types";
import {
  ELEVENLABS_API_BASE,
  ELEVENLABS_DEFAULT_MODEL,
  ELEVENLABS_TTS_MIME,
  ELEVENLABS_TTS_SAMPLE_RATE,
} from "./constants";
import { elevenLabsHeaders } from "./client";

async function requestTtsBytes(input: SynthesizeInput): Promise<Buffer> {
  const voiceId = input.voice;
  if (!voiceId) throw new Error("ElevenLabs TTS requires a voice id.");

  const model = input.apiModelId ?? ELEVENLABS_DEFAULT_MODEL;
  const languageCode = input.language
    ? getProviderLanguageCodeForKonvo(input.language)
    : "en";

  const response = await fetch(
    `${ELEVENLABS_API_BASE}/v1/text-to-speech/${voiceId}/stream?output_format=pcm_24000`,
    {
      method: "POST",
      headers: { ...elevenLabsHeaders(input.providerApiKey), "Content-Type": "application/json" },
      body: JSON.stringify({
        text: input.text,
        model_id: model,
        language_code: languageCode,
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export const elevenlabsTtsProvider: TtsProvider = {
  id: "elevenlabs",
  supportsStream: true,
  streamFormat: { mimeType: ELEVENLABS_TTS_MIME, sampleRate: ELEVENLABS_TTS_SAMPLE_RATE },

  async synthesize(input) {
    const audio = await requestTtsBytes(input);
    return { audio, mimeType: ELEVENLABS_TTS_MIME };
  },

  async *synthesizeStream(input): AsyncIterable<Uint8Array> {
    // V1: buffer then yield (matches cartesia/sarvam). Optional V2 below.
    const audio = await requestTtsBytes(input);
    if (audio.length > 0) yield new Uint8Array(audio);
  },
};
```

> **Optional true streaming (V2):** read `response.body.getReader()` and yield
> PCM chunks as they arrive (see `openai/tts.ts › readResponseBody`) for lower
> time-to-first-audio. The V1 buffer-then-yield is correct and matches Cartesia;
> ship V1 first, optimize later. `eleven_v3` is the highest-latency model — if
> realtime latency matters, prefer `eleven_flash_v2_5` and true streaming.

**Register in `speech/registry.ts`:**
```ts
import { elevenlabsTtsProvider } from "./providers/elevenlabs/tts";
// ...
const TTS_PROVIDERS: Record<SpeechProviderId, TtsProvider> = {
  openai: openaiTtsProvider,
  cartesia: cartesiaTtsProvider,
  sarvam: sarvamTtsProvider,
  elevenlabs: elevenlabsTtsProvider,
};
```
ElevenLabs is TTS-only — there is **no** `STT_PROVIDERS` entry, so the
`speechProviderId` guard must allow `elevenlabs` for TTS lookups but
`getSttProvider` will (correctly) never resolve an elevenlabs model since no
catalog STT row points at it.

### 3.5 Env-var fallback

**`src/lib/konvo-voice/sessionCatalog.ts › isProviderConfigured`**
```ts
case "elevenlabs":
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
```

Add `ELEVENLABS_API_KEY=...` to `.env.local` (and any deploy env / secrets
manager). This is the platform-wide fallback when no DB key is configured for the
provider.

### 3.6 Locale → voice map

**`src/lib/konvo-voice/speechModelLocales.ts`**

Add an entry to `KONVO_TTS_MODEL_VOICES`. Because ElevenLabs voices are
language-agnostic for multilingual models, reuse one default voice id across the
locales we want to expose. Start with the locales the platform already supports
(intersection with the rest of the catalog) — e.g.:
```ts
"elevenlabs-eleven-v3": {
  en: ELEVENLABS_DEFAULT_VOICE_ID,
  "en-IN": ELEVENLABS_DEFAULT_VOICE_ID,
  es: ELEVENLABS_DEFAULT_VOICE_ID,
  fr: ELEVENLABS_DEFAULT_VOICE_ID,
  de: ELEVENLABS_DEFAULT_VOICE_ID,
  hi: ELEVENLABS_DEFAULT_VOICE_ID,
  // ...extend to the full eleven_v3 language list as needed
},
```
(Import `ELEVENLABS_DEFAULT_VOICE_ID` from the provider constants, or inline the
id.) This entry drives `resolveTtsVoice`, the catalog `supportedLanguageCodes`
(via `buildCatalogLocaleCodesFromCapabilities`), and the `KONVO_LOCALE_CAPABILITIES`
union automatically — no other locale file edits required.

> If we later want per-locale or per-persona distinct voices, give each locale
> its own voice id here (same shape as the Cartesia map).

### 3.7 Database constraint migration

The provider allowlist is enforced by a CHECK constraint
(`20260526210000_expand_ai_catalog_providers.sql`). Add a new migration so admins
can persist an ElevenLabs binding / activation:

**`supabase/migrations/<timestamp>_add_elevenlabs_provider.sql`**
```sql
alter table public.ai_provider_activations
  drop constraint if exists ai_provider_activations_provider_check;
alter table public.ai_provider_activations
  add constraint ai_provider_activations_provider_check
  check (provider_id = any (array['google','openai','cartesia','sarvam','elevenlabs']::text[]));

alter table public.ai_function_bindings
  drop constraint if exists ai_function_bindings_provider_check;
alter table public.ai_function_bindings
  add constraint ai_function_bindings_provider_check
  check (provider_id = any (array['google','openai','cartesia','sarvam','elevenlabs']::text[]));
```

---

## 4. What does NOT need to change

- **Admin AI settings UI** — provider list and model picker render from
  `CATALOG_PROVIDERS` / `CATALOG_MODELS`, so ElevenLabs appears automatically.
- **`getLanguageModel` / `providerOptions`** — text-only; ElevenLabs is speech.
- **`resolveProviderApiKeyForAssignment`, `getProviderApiKey`** — generic record
  lookups by `ProviderId`.
- **TTS route, SSE, streaming player** — provider-agnostic; consume
  `TtsProvider.streamFormat` + chunks. PCM 24 kHz matches the existing contract.
- **STT / realtime** — out of scope.

---

## 5. File touch list

| File | Change |
|---|---|
| `src/lib/ai/catalog/types.ts` | add `"elevenlabs"` to `ProviderId` |
| `src/lib/konvo-voice/speech/types.ts` | add `"elevenlabs"` to `SpeechProviderId` |
| `src/lib/ai/catalog/data.ts` | provider id + provider entry + model row(s) |
| `src/lib/konvo-voice/speech/providers/elevenlabs/constants.ts` | **new** |
| `src/lib/konvo-voice/speech/providers/elevenlabs/client.ts` | **new** |
| `src/lib/konvo-voice/speech/providers/elevenlabs/tts.ts` | **new** |
| `src/lib/konvo-voice/speech/registry.ts` | import + register in `TTS_PROVIDERS`, allow in guard |
| `src/lib/konvo-voice/sessionCatalog.ts` | `isProviderConfigured` case |
| `src/lib/konvo-voice/speechModelLocales.ts` | `KONVO_TTS_MODEL_VOICES` entry |
| `supabase/migrations/<ts>_add_elevenlabs_provider.sql` | **new** constraint migration |
| `.env.local` (+ deploy env) | `ELEVENLABS_API_KEY` |

---

## 6. Test / verification plan

1. **Type-check** (`tsc` / `next build`) — confirms every exhaustive
   `ProviderId` switch was updated.
2. **Env path:** set `ELEVENLABS_API_KEY`, leave DB unconfigured. In AI settings,
   bind `text_to_speech` → ElevenLabs Eleven v3 at platform scope. Open a
   multimodal assignment; confirm `/api/multimodal/tts` streams audio and the
   player plays it for `en` and one non-English locale (e.g. `hi`/`es`).
3. **DB-key path:** activate ElevenLabs with a key in the AI settings UI (class
   scope), confirm `resolveProviderApiKeyForAssignment` returns it and synthesis
   works without the env var.
4. **Failure modes:** bad key → 400 with provider detail surfaced; unsupported
   locale → `KonvoLocaleVoiceError` 400 (no voice in the map).
5. **Migration:** apply locally, confirm an `elevenlabs` binding row inserts
   without violating the CHECK constraint.

---

## 7. Phasing

- **Phase 1 (this plan):** Eleven v3 TTS, buffer-then-yield streaming, single
  default voice reused across locales. Selectable platform/institution/class.
- **Phase 2 (optional):** true chunked PCM streaming for lower latency; add
  `eleven_flash_v2_5` as a second low-latency model row; richer per-locale or
  per-persona voice mapping; `voice_settings` (stability/similarity) exposure.
