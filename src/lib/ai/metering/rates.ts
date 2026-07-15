import { CATALOG_MODELS } from "@/lib/ai/catalog/data";

/**
 * Rate card — dev-docs/ai-usage-metering-plan.md §4.4.
 * Typed TS config, keyed off the catalog's model `id` (not the provider's
 * `apiModelId`, which only speech entries have and which differs from the
 * catalog id). Fast, testable, colocated; migrate to a DB table only when
 * finance needs runtime edits (§4.4).
 *
 * Only `status: "available"` catalog models need an entry here —
 * `coming_soon` models get priced when they're actually activated, not
 * guessed ahead of it (`assertRateCardComplete()` only checks available
 * models). Every `usdPerUnit` below is each provider's actual published
 * pricing, sourced 2026-07-13 — see the per-entry comments for sourcing
 * detail. Not a finance-signed contract, just real public pricing.
 *
 * Repricing is forward-only via a new rate version (see
 * `RATE_CARD_VERSIONS` below) — never edit an existing version's rates.
 */

export type RateMetric =
  | "input_token"
  | "output_token"
  | "cached_input_token"
  | "reasoning_token"
  | "audio_input_token"
  | "image_input_token"
  | "audio_second"
  | "audio_output_second"
  | "character"
  | "session_second"
  | "image"
  | "video_second"
  | "request";

export interface RateEntry {
  /** $ per single raw unit; drives cost_usd. Full precision, never pre-rounded. */
  usdPerUnit: number;
  /**
   * Present when `usdPerUnit` is derived through a provider-native billing
   * unit (a prepaid-credit system, or a foreign currency) rather than being
   * a directly-published USD price. Lets the invocation row store the
   * native cost alongside `cost_usd`, so it can be reconciled directly
   * against the provider's own invoice/dashboard — independent of whether
   * our USD conversion is currently correct. See `nativeRate()` below.
   */
  native?: NativeRateInfo;
}

export interface NativeRateInfo {
  /**
   * The provider's own unit of account — either their prepaid-credit system
   * (e.g. `"cartesia_credit"`) or a foreign-currency code (e.g. `"inr"`).
   */
  unit: string;
  /**
   * Native units consumed per one raw metering unit — the provider's own
   * fixed billing formula (e.g. 1 Cartesia credit per character; ₹30 per
   * hour of Sarvam audio). This is a fact from the provider's price list,
   * not an assumption, and doesn't change unless the provider reprices.
   */
  nativeUnitsPerRawUnit: number;
  /**
   * $ per one native unit — the volatile part. For a credit system this
   * depends on which prepaid plan bundle the platform actually bought; for
   * a foreign currency it's today's FX rate. Both drift independently of
   * the provider's own price list above, so track them separately and
   * re-confirm `asOfDate` periodically — this is the number most likely to
   * go stale unnoticed.
   */
  usdPerNativeUnit: number;
  /** ISO date `usdPerNativeUnit` was last confirmed accurate. */
  asOfDate: string;
  /** Free-text: which plan / FX source this was derived from, for whoever re-confirms it next. */
  source: string;
}

/** Builds a RateEntry from native-unit info, deriving usdPerUnit so the two never drift out of sync with each other. */
function nativeRate(native: NativeRateInfo): RateEntry {
  return { usdPerUnit: native.nativeUnitsPerRawUnit * native.usdPerNativeUnit, native };
}

export type ModelRateCard = Partial<Record<RateMetric, RateEntry>>;

export interface CatalogModelRateCard {
  /** No real rate yet — never blocks activation, just means null cost/credits until priced. */
  unpriced?: true;
  rates?: ModelRateCard;
}

/**
 * Fallback chain within a model (§4.4 rule 1): a fine-grained metric
 * (cached/reasoning/audio-input/image-input tokens) falls back to the
 * blended input/output token rate when no dedicated entry exists. Models
 * whose fine-grained pricing actually diverges from the blended rate (e.g.
 * Gemini audio input, priced well above Gemini text input) should define an
 * explicit entry instead of relying on this fallback — see
 * `gemini-3-flash-preview` below.
 */
const FALLBACK_METRIC: Partial<Record<RateMetric, RateMetric>> = {
  cached_input_token: "input_token",
  reasoning_token: "output_token",
  audio_input_token: "input_token",
  image_input_token: "input_token",
};

interface RateCardVersion {
  /** ISO date this version took effect — informational, not enforced at runtime. */
  effectiveDate: string;
  /** What changed relative to the previous version — for anyone reading this file or git blame later. */
  notes: string;
  /**
   * credits = cost_usd * creditsPerUsd (§4.4). Versioned alongside `entries`
   * so a historical row's `credits` can always be reproduced from its
   * `rate_version` alone, even if a later version rescales what a credit is
   * worth.
   */
  creditsPerUsd: number;
  /**
   * One entry per priced catalog model, grouped contiguously by provider
   * (mirroring `CATALOG_PROVIDERS`, src/lib/ai/catalog/data.ts) so the rate
   * card stays easy to scan — `assertRateCardComplete()` enforces both the
   * coverage and the grouping at build time.
   */
  entries: Record<string, CatalogModelRateCard>;
}

/**
 * Every historical rate version stays in this map, in full, forever.
 * **Never mutate an existing version's `entries` or `creditsPerUsd` in
 * place.** To reprice: copy the current version's `entries` into a new
 * version key, edit the copy, bump `CURRENT_RATE_VERSION` below. This is
 * what makes `ai_invocations.rate_version` actually mean something — given
 * any row's `rate_version`, `RATE_CARD_VERSIONS[row.rate_version]`
 * reproduces exactly the rates used to compute that row's
 * `cost_usd`/`credits`, indefinitely (§4.4 rule 4: "historical bills never
 * change").
 */
const RATE_CARD_VERSIONS: Record<string, RateCardVersion> = {
  v1: {
    effectiveDate: "2026-07-13",
    notes:
      "Launch rate card — each provider's actual published pricing for " +
      "every currently-available model. Cartesia/Sarvam carry explicit " +
      "NativeRateInfo (raw units -> provider-native unit is a stable " +
      "published fact; native unit -> USD is the volatile part — confirmed " +
      "plan/FX, dated, and separately re-confirmable without touching the " +
      "raw-unit math). Cartesia priced at the platform's confirmed Startup " +
      "plan. coming_soon models aren't carried here — they get priced at " +
      "activation time.",
    creditsPerUsd: 1000, // 1 credit = $0.001
    entries: {
      // ---------------------------------------------------------------
      // google
      // ---------------------------------------------------------------
      "gemini-3-flash-preview": {
        // Google's published Gemini 3 Flash Preview pricing: text/image/video
        // input $0.50/1M, output $3.00/1M, audio input $1.00/1M (~2x text
        // input) — audio input gets its own entry rather than the blended
        // `input_token` fallback since the real per-token rate genuinely
        // diverges for this model family.
        rates: {
          input_token: { usdPerUnit: 0.5 / 1_000_000 },
          output_token: { usdPerUnit: 3.0 / 1_000_000 },
          audio_input_token: { usdPerUnit: 1.0 / 1_000_000 },
        },
      },

      // ---------------------------------------------------------------
      // openai
      // ---------------------------------------------------------------
      "gpt-5.4": {
        // OpenAI's published GPT-5.4 pricing. Image input is
        // provider-normalized into text input tokens before billing (no
        // separate per-image-token price list from OpenAI), so the blended
        // `input_token` rate is intentionally correct here, not a gap —
        // unlike the Gemini audio case above.
        rates: {
          input_token: { usdPerUnit: 2.5 / 1_000_000 },
          output_token: { usdPerUnit: 15.0 / 1_000_000 },
          cached_input_token: { usdPerUnit: 0.25 / 1_000_000 },
        },
      },
      "gpt-4o": {
        // OpenAI's published GPT-4o pricing (cached input = 50% of input, per
        // OpenAI's prompt-caching discount).
        rates: {
          input_token: { usdPerUnit: 2.5 / 1_000_000 },
          output_token: { usdPerUnit: 10.0 / 1_000_000 },
          cached_input_token: { usdPerUnit: 1.25 / 1_000_000 },
        },
      },
      "openai-gpt-4o-mini-transcribe": {
        // Token-billed, priced on the exact counts OpenAI's response reports
        // (Transcription.Tokens.input_token_details.audio_tokens / output_tokens):
        // $1.25/1M audio-input tokens, $5.00/1M output text tokens — real
        // published pricing, applied via contributionsForUsage's
        // speech_to_text token-preference branch (computeUsage.ts).
        // audio_second stays as a fallback rate for the case token usage
        // isn't reported (e.g. a future response-shape change) — the
        // ~$0.003/min blended-equivalent OpenAI publishes for that case.
        rates: {
          audio_input_token: { usdPerUnit: 1.25 / 1_000_000 },
          output_token: { usdPerUnit: 5.0 / 1_000_000 },
          audio_second: { usdPerUnit: 0.003 / 60 },
        },
      },
      "openai-gpt-4o-mini-tts": {
        // OpenAI bills this as $0.60/1M text-input tokens + $12/1M
        // audio-output tokens. We can't use `audio_output_second` here —
        // `computeAudioOutputMs` (gateway/speech.ts) only measures duration
        // from raw L16 PCM bytes, and this provider's batch synth returns a
        // compressed format, so audio_output_second would silently resolve
        // to null on every real call. Instead we approximate OpenAI's full
        // blended cost (both token components) per input character, using a
        // ~900 chars/minute-of-speech conversion, so `character` — the
        // metric this provider's synth path reliably reports — actually
        // reflects total cost, not just the small text-input-token slice.
        rates: { character: { usdPerUnit: 0.015 / 900 } },
      },

      // ---------------------------------------------------------------
      // cartesia — native-tracked, priced at the platform's actual plan
      // ---------------------------------------------------------------
      "cartesia-ink-whisper": {
        // Cartesia bills Ink at exactly 1 credit per second of audio — that
        // formula is fixed by Cartesia, not an assumption. What *is* an
        // assumption is which prepaid bundle sets $/credit: the platform is
        // confirmed on the Startup plan ($39 / 1,250,000 credits).
        rates: {
          audio_second: nativeRate({
            unit: "cartesia_credit",
            nativeUnitsPerRawUnit: 1, // 1 credit per second — Cartesia's own formula
            usdPerNativeUnit: 39 / 1_250_000, // Startup plan: $39 for 1,250,000 credits
            asOfDate: "2026-07-13",
            source: "Cartesia Startup plan ($39/mo, 1,250,000 credits) — confirmed with platform team",
          }),
        },
      },
      "cartesia-sonic-3-5": {
        // Cartesia bills Sonic at exactly 1 credit per character.
        rates: {
          character: nativeRate({
            unit: "cartesia_credit",
            nativeUnitsPerRawUnit: 1, // 1 credit per character — Cartesia's own formula
            usdPerNativeUnit: 39 / 1_250_000, // Startup plan: $39 for 1,250,000 credits
            asOfDate: "2026-07-13",
            source: "Cartesia Startup plan ($39/mo, 1,250,000 credits) — confirmed with platform team",
          }),
        },
      },

      // ---------------------------------------------------------------
      // sarvam — native-tracked (native unit = INR, the FX rate is the
      // volatile part, kept separate from Sarvam's own INR price list)
      // ---------------------------------------------------------------
      "sarvam-saaras-v3-stt": {
        rates: {
          audio_second: nativeRate({
            unit: "inr",
            nativeUnitsPerRawUnit: 30 / 3600, // ₹30/hour — Sarvam's own published price
            usdPerNativeUnit: 1 / 83, // pinned FX: $1 = ₹83
            asOfDate: "2026-07-13",
            source: "Sarvam published rate (₹30/hr) at a pinned ₹83/$ FX snapshot — re-confirm FX periodically",
          }),
        },
      },
      "sarvam-bulbul-v3-tts": {
        rates: {
          character: nativeRate({
            unit: "inr",
            nativeUnitsPerRawUnit: 30 / 10_000, // ₹30 per 10,000 chars — Sarvam's own published price
            usdPerNativeUnit: 1 / 83, // pinned FX: $1 = ₹83
            asOfDate: "2026-07-13",
            source: "Sarvam published rate (₹30/10k chars) at a pinned ₹83/$ FX snapshot — re-confirm FX periodically",
          }),
        },
      },
    },
  },
};

/** The rate version new invocation rows are priced at. See §4.4 rule 4. */
export const CURRENT_RATE_VERSION = "v1";

function getVersion(rateVersion: string): RateCardVersion | null {
  return RATE_CARD_VERSIONS[rateVersion] ?? null;
}

export function getRateCardEntry(
  catalogModelId: string,
  rateVersion: string = CURRENT_RATE_VERSION,
): CatalogModelRateCard | null {
  return getVersion(rateVersion)?.entries[catalogModelId] ?? null;
}

export function getCreditsPerUsd(rateVersion: string = CURRENT_RATE_VERSION): number | null {
  return getVersion(rateVersion)?.creditsPerUsd ?? null;
}

/**
 * Resolve a rate for (catalogModelId, metric) at a given rate version
 * (defaulting to current), applying the §4.4 rule-1 fallback chain. Returns
 * null when the version/model is unknown or unpriced, or the metric (and its
 * fallback) have no entry — callers must treat null as "cannot price", never
 * as zero (§4.4 rule 3). This is the expected outcome for `coming_soon`
 * models, which have no rate-card entry at all until activated.
 */
export function resolveRate(
  catalogModelId: string,
  metric: RateMetric,
  rateVersion: string = CURRENT_RATE_VERSION,
): RateEntry | null {
  const entry = getVersion(rateVersion)?.entries[catalogModelId];
  if (!entry || entry.unpriced || !entry.rates) return null;
  const direct = entry.rates[metric];
  if (direct) return direct;
  const fallbackMetric = FALLBACK_METRIC[metric];
  if (fallbackMetric) return entry.rates[fallbackMetric] ?? null;
  return null;
}

export function isUnpricedModel(
  catalogModelId: string,
  rateVersion: string = CURRENT_RATE_VERSION,
): boolean {
  return getVersion(rateVersion)?.entries[catalogModelId]?.unpriced === true;
}

/**
 * Build-gated (§7.3): every `status: "available"` catalog model must appear
 * in the *current* rate version, either with real rates or an explicit
 * `unpriced: true` marker — so an available model can never ship
 * half-priced. `coming_soon` models are intentionally excluded: they get
 * priced when they're actually activated, not guessed ahead of it. Also
 * enforces that entries for the same provider are declared contiguously, so
 * the rate card can't silently drift back into an interleaved, hard-to-scan
 * layout as models are added.
 */
export function assertRateCardComplete(): void {
  const version = getVersion(CURRENT_RATE_VERSION);
  if (!version) {
    throw new Error(
      `AI usage metering: CURRENT_RATE_VERSION "${CURRENT_RATE_VERSION}" has no entry in ` +
        `RATE_CARD_VERSIONS (src/lib/ai/metering/rates.ts).`,
    );
  }

  const catalogById = new Map(CATALOG_MODELS.map((model) => [model.id, model]));
  const seenProviders = new Set<string>();
  let lastProviderId: string | null = null;
  for (const id of Object.keys(version.entries)) {
    const providerId = catalogById.get(id)?.providerId;
    if (!providerId || providerId === lastProviderId) continue;
    if (seenProviders.has(providerId)) {
      throw new Error(
        `AI usage metering: provider "${providerId}" entries are split across non-contiguous ` +
          `positions in RATE_CARD_VERSIONS.${CURRENT_RATE_VERSION}.entries ` +
          `(src/lib/ai/metering/rates.ts) — group all of a provider's models together so the ` +
          `rate card stays easy to scan against CATALOG_PROVIDERS (src/lib/ai/catalog/data.ts).`,
      );
    }
    seenProviders.add(providerId);
    lastProviderId = providerId;
  }

  for (const model of CATALOG_MODELS) {
    if (model.status !== "available") continue;
    const entry = version.entries[model.id];
    if (!entry) {
      throw new Error(
        `AI usage metering: available catalog model "${model.id}" has no rate-card entry ` +
          `in RATE_CARD_VERSIONS.${CURRENT_RATE_VERSION} (src/lib/ai/metering/rates.ts). ` +
          `Add real rates, or { unpriced: true } if this is intentional ` +
          `(see dev-docs/ai-usage-metering-plan.md §4.4, §7.3).`,
      );
    }
    if (entry.unpriced) continue;
    if (!entry.rates || Object.keys(entry.rates).length === 0) {
      throw new Error(
        `AI usage metering: catalog model "${model.id}" has an empty rate card ` +
          `and is not marked { unpriced: true }. See dev-docs/ai-usage-metering-plan.md §4.4.`,
      );
    }
  }
}
