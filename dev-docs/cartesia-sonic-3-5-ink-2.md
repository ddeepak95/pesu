# Cartesia Sonic-3.5 (TTS) + Ink-2 (STT)

Wire Cartesia's current-generation speech models into the catalog:

- **Sonic-3.5** — latest Sonic **TTS** model. 42 languages, native turn-by-turn
  prosody, sub-100 ms latency. Already partially wired (see §2); the remaining
  work is **expanding the locale → voice map** to Sonic-3.5's full language set.
- **Ink-2** — Cartesia's newest streaming **STT** model. **English-only.** Adds
  native turn detection + structured-data accuracy and ~0.1 s time-to-final.
  For any non-English locale you must keep using `ink-whisper`.

Cartesia is **already a registered provider** (`SpeechProviderId` includes
`cartesia`; the provider client, registry entries, and `isProviderConfigured`
case all exist). So neither model needs provider-union, registry, or migration
changes — this is purely **catalog rows + locale maps** (plus one small STT
routing guard for Ink-2's English-only constraint).

> Read alongside `dev-docs/model-selection.md` (catalog resolution chain) and
> `dev-docs/language-support.md` (how a learner's locale drives voice/transcription).
> Mirrors the structure of `dev-docs/elevenlabs-tts-plan.md`, but much smaller
> scope because the provider already exists.

---

## 1. How Cartesia speech flows today (context)

```
TTS:  /api/multimodal/tts
        ├─ getCatalogEntry(ttsModelId)            → ModelCatalogEntry (catalog/data.ts)
        ├─ resolveTtsVoice(ttsModelId, locale)    → voice id (speechModelLocales.ts)
        └─ getTtsProvider(ttsModelId)             → cartesiaTtsProvider (registry.ts)
              └─ POST {CARTESIA_API_BASE}/tts/bytes  (model_id = entry.apiModelId)

STT:  /api/multimodal/... (transcribe)
        ├─ getCatalogEntry(sttModelId)            → ModelCatalogEntry
        ├─ isSttModelLocaleSupported(id, locale)  → speechModelLocales.ts
        └─ getSttProvider(sttModelId)             → cartesiaSttProvider (registry.ts)
              └─ POST {CARTESIA_API_BASE}/audio/transcriptions  (model = entry.apiModelId)
```

Two files carry **all** per-model config:

- **`src/lib/ai/catalog/data.ts › CATALOG_MODELS`** — the selectable model row
  (`apiModelId`, tasks, status). `supportedLanguageCodes` is **derived** from the
  locale map below via `buildCatalogLocaleCodesFromCapabilities(...)`.
- **`src/lib/konvo-voice/speechModelLocales.ts`** — the source of truth for
  language support: `KONVO_TTS_MODEL_VOICES[modelId]` (locale → voice id) for TTS,
  `KONVO_STT_MODEL_LOCALES[modelId]` (set of locales) for STT. **Presence of a
  locale key = the model supports that locale.** This is exactly what "configure
  language support" means here.

Cartesia API surface (current `Cartesia-Version: 2026-03-01`, set in
`providers/cartesia/constants.ts`):
- TTS: `POST /tts/bytes`, body `{ model_id, transcript, voice:{mode:"id",id}, language, output_format }`, returns raw `pcm_s16le` @ 24 kHz → `audio/L16;rate=24000`.
- STT: `POST /audio/transcriptions` (multipart `file`, `model`, `language`), returns `{ text }`.

---

## 2. Current state — what is already wired

| Model | Catalog id | `apiModelId` | Status |
|---|---|---|---|
| Sonic-3.5 (TTS) | `cartesia-sonic-3-5` | `sonic-3.5` | **already present** in `CATALOG_MODELS`; `KONVO_TTS_MODEL_VOICES["cartesia-sonic-3-5"]` maps **30 locales** |
| Ink Whisper (STT) | `cartesia-ink-whisper` | `ink-whisper` | already present; multilingual (30 locales) |
| **Ink-2 (STT)** | `cartesia-ink-2` | `ink-2` | **NOT present — add it** |

`providers/cartesia/tts.ts` already defaults to `sonic-3.5` and
`providers/cartesia/stt.ts` defaults to `ink-whisper`, both overridable by
`input.apiModelId` (i.e. the catalog row's `apiModelId`). So:

- **Sonic-3.5:** working today. Outstanding task = grow its locale map from 30 →
  the full Sonic-3.5 language set (§4).
- **Ink-2:** needs a new catalog row + an English-only locale entry + a routing
  guard (§5).

---

## 3. Cartesia model facts (verified against Cartesia docs)

### 3.1 Sonic-3.5 (TTS)

- **`model_id`:** `sonic-3.5` (rolling — auto-points at the latest stable
  snapshot). Pin with `sonic-3.5-2026-05-04` if you need reproducibility.
- **Languages: 42 out of the box**, including 9 Indian languages, 500+ voices.
  ISO-639-1 codes:

  ```
  en de es fr it nl pl ru sv tr cs el fi hr sk da uk hu no pt ro bg
  zh ja ko vi th id ms tl ta te gu kn ml mr pa bn hi ar he ka
  ```

  Indian-language subset: `hi ta te gu kn ml mr pa bn`.
- One **voice id per (language, persona)** — Cartesia voices are **not**
  language-agnostic (unlike ElevenLabs). Each locale key in the map needs a voice
  id valid for that language. Get ids from the Cartesia voice library
  (https://play.cartesia.ai) or `GET /voices`.
- Output `pcm_s16le` @ 24 kHz → already matches `audio/L16;rate=24000`.

### 3.2 Ink-2 (STT)

- **`model` string:** `ink-2`. Valid on the same `POST /audio/transcriptions`
  batch endpoint already used by `cartesia-ink-whisper`.
- **Language: English only (`en`).** This is the defining constraint. Per
  Cartesia: passing a non-English `language` without a model auto-selects
  `ink-whisper`; but because our code passes `model=ink-2` **explicitly**, a
  non-English request would not silently fall back — it must be routed to
  `ink-whisper` by us (§5.3).
- **Strengths:** lowest streaming WER, native turn detection
  (`turn.start`/`turn.end`, semantic endpointing), interim results, native
  handling of structured data (phone numbers, dates, emails, currency), ~0.1 s
  time-to-final.
- **Note on streaming:** Ink-2's turn-detection/interim-results advantages live on
  the **WebSocket streaming** endpoint. Our current `cartesiaSttProvider` is
  `supportsStream: false` (batch). Adding Ink-2 as a **batch** model is valid and
  gives the accuracy win for English; true streaming turn detection is a separate,
  larger effort (out of scope — see §8).

---

## 4. Sonic-3.5 — expand language support

Only one file changes: `src/lib/konvo-voice/speechModelLocales.ts`.

`KONVO_TTS_MODEL_VOICES["cartesia-sonic-3-5"]` currently maps **30** locales.
Sonic-3.5 supports **42**. Add the **intersection of Sonic-3.5's languages and
the platform's curated locales** that you actually want to expose, giving each a
real voice id from the Cartesia library.

Cartesia-supported locales **not yet in the map** (candidates to add):

```
pl  sv  fi  hr  sk  hu  no  ro  bg  gu  ms  tl  ka
```

(The existing map's `en-IN` and `od` are platform locale variants. `en-IN` is a
platform choice mapped to an India-accented English voice; keep it. Cartesia does
not list `od` (Odia) for Sonic-3.5 — leave Odia to Sarvam Bulbul, which does
support it.)

Add only locales the platform's locale registry recognizes; for each, pick a
voice id valid for that language:

```ts
"cartesia-sonic-3-5": {
  // ...existing 30 entries...
  pl: "<cartesia voice id (pl)>",
  sv: "<cartesia voice id (sv)>",
  fi: "<cartesia voice id (fi)>",
  // ...repeat for any of: hr sk hu no ro bg gu ms tl ka
},
```

No catalog edit needed — `supportedLanguageCodes` for `cartesia-sonic-3-5` is
derived from this map by `buildCatalogLocaleCodesFromCapabilities`, and the
`KONVO_LOCALE_CAPABILITIES` union picks up new locales automatically.

> Do **not** add a locale here without a tested voice id — a present key with a
> bad id makes `resolveTtsVoice` hand a non-functional voice to `/tts/bytes`,
> which 400s at request time rather than failing closed in the picker.

---

## 5. Ink-2 — add the English-only STT model

### 5.1 Catalog row — `src/lib/ai/catalog/data.ts › CATALOG_MODELS`

```ts
{
  id: "cartesia-ink-2",
  providerId: "cartesia",
  label: "Cartesia Ink-2",
  modelClass: "speech",
  tasks: ["speech_to_text"],
  io: { inputs: ["audio"], outputs: ["text"] },
  status: "available",
  apiSurface: "transcribe",
  apiModelId: "ink-2",
  sttDelivery: "batch",
  supportedLanguageCodes: buildCatalogLocaleCodesFromCapabilities(
    "cartesia-ink-2",
    "speech_to_text",
  ),
},
```

Optionally update the provider blurb in `CATALOG_PROVIDERS` (cartesia):
`"Ink STT (Ink-2 / Ink Whisper) and Sonic TTS for voice prototypes."`

### 5.2 Locale set — `src/lib/konvo-voice/speechModelLocales.ts`

Add to `KONVO_STT_MODEL_LOCALES`. **English only** — this is the whole point of
the language-support configuration for Ink-2:

```ts
// Cartesia Ink-2 — streaming STT, English-only (use ink-whisper for other locales).
"cartesia-ink-2": new Set<LocaleTag>(["en"]),
```

Because the catalog `supportedLanguageCodes` is derived from this set, the admin
UI and `isSttModelLocaleSupported` will correctly report Ink-2 as English-only,
and a non-English class that selects Ink-2 will fail the locale check up front
instead of silently mis-transcribing.

> Do **not** add `en-IN` here. Cartesia Ink-2's enum is bare `en`; route
> India-accented English transcription through `ink-whisper` (which lists `en-IN`)
> unless you verify `en-IN` is accepted by Ink-2.

### 5.3 Routing guard — `src/lib/konvo-voice/speech/providers/cartesia/stt.ts`

Defense-in-depth so that even if a non-English request reaches the Cartesia STT
provider with `model=ink-2`, we transcribe with the multilingual model instead of
sending English-only `ink-2` a non-English `language`:

```ts
const requested = input.apiModelId ?? "ink-whisper";
const language = input.language
  ? getProviderLanguageCodeForKonvo(input.language)
  : "en";
// Ink-2 is English-only; fall back to the multilingual model for other locales.
const model = requested === "ink-2" && language !== "en" ? "ink-whisper" : requested;
```

(The locale gate in §5.2 should already prevent this combination from being
selectable, but the guard mirrors Cartesia's own "non-English auto-selects
ink-whisper" behavior and keeps the provider robust to misconfiguration.)

---

## 6. Language-support summary (the configured behavior)

| Locale request | TTS (`text_to_speech`) | STT (`speech_to_text`) |
|---|---|---|
| `en` | Sonic-3.5 ✓ | **Ink-2 ✓** (best English path) or Ink Whisper |
| `hi`, `ta`, … Indian | Sonic-3.5 ✓ (9 Indian langs) | Ink Whisper ✓ (Ink-2 → guard falls back) |
| other Sonic-3.5 langs (e.g. `pl`, `sv`) | Sonic-3.5 ✓ *(once mapped, §4)* | Ink Whisper if listed; else unsupported |
| locale not in either map | not offered / 400 `KonvoLocaleVoiceError` | not offered / locale check fails |

Operational guidance for admins (AI settings UI):
- **Multilingual classes:** keep STT = **Ink Whisper**. Ink-2 will only transcribe
  English.
- **English-only / realtime-leaning classes:** STT = **Ink-2** for the accuracy +
  turn-detection win.
- **TTS:** Sonic-3.5 for all supported locales.

---

## 7. File touch list

| File | Sonic-3.5 | Ink-2 |
|---|---|---|
| `src/lib/konvo-voice/speechModelLocales.ts` | expand `KONVO_TTS_MODEL_VOICES["cartesia-sonic-3-5"]` (§4) | add `KONVO_STT_MODEL_LOCALES["cartesia-ink-2"] = {en}` (§5.2) |
| `src/lib/ai/catalog/data.ts` | — (row exists) | add `cartesia-ink-2` model row (§5.1); optional provider blurb |
| `src/lib/konvo-voice/speech/providers/cartesia/stt.ts` | — | add Ink-2→Ink-Whisper fallback guard (§5.3) |

No changes to: `ProviderId`/`SpeechProviderId` unions, `registry.ts`,
`sessionCatalog.ts › isProviderConfigured`, `client.ts`, or DB migrations —
Cartesia is already an allowed provider.

---

## 8. Test / verification plan

1. **Type-check** (`tsc` / `next build`).
2. **Sonic-3.5 TTS:** in AI settings bind `text_to_speech` → Cartesia Sonic-3.5;
   open a multimodal assignment and confirm audio for `en`, one Indian locale
   (`hi`/`ta`), and one newly-added locale (e.g. `pl`/`sv`). A bad/missing voice
   id surfaces as a 400 from `/tts/bytes`.
3. **Ink-2 STT (English):** bind `speech_to_text` → Cartesia Ink-2 on an
   English class; record audio; confirm transcription returns text and structured
   data (e.g. a phone number) is well-formed.
4. **Ink-2 language gate:** a non-English class should not be able to select
   Ink-2 (locale check); if forced, the §5.3 guard routes to `ink-whisper` rather
   than failing/mis-transcribing.
5. **Ink Whisper regression:** multilingual class still transcribes non-English
   correctly.

---

## 9. Out of scope / phasing

- **Phase 1 (this doc):** Ink-2 as a **batch** English STT model; Sonic-3.5
  locale-map expansion; English-only routing guard.
- **Phase 2 (optional):** true **WebSocket streaming** for Ink-2 to unlock native
  turn detection (`turn.start`/`turn.end`), semantic endpointing, and interim
  results — requires a streaming STT provider path (`supportsStream: true`,
  WS continuation similar to the existing `cartesia/ws-continuation.ts` used for
  TTS) and turn-event plumbing into the multimodal turn loop.
- **Phase 2 (optional):** per-persona Sonic-3.5 voices (multiple voice ids per
  locale) and pinning to a dated snapshot (`sonic-3.5-YYYY-MM-DD`).

---

## Sources

- [Sonic 3.5 — Cartesia Docs (latest TTS model + language list)](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest)
- [Cartesia STT models — Ink-2 vs Ink Whisper](https://docs.cartesia.ai/build-with-cartesia/models/stt)
- [Introducing Sonic-3.5 and Ink-2 (launch)](https://www.cartesia.ai/launch/)
- [Cartesia Ink (STT)](https://www.cartesia.ai/ink)
