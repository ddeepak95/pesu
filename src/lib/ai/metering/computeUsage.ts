import { CURRENT_RATE_VERSION, getCreditsPerUsd, resolveRate, type RateMetric } from "@/lib/ai/metering/rates";
import type { UsageType } from "@/lib/ai/metering/usageTypes";

/**
 * Per-modality / cached / reasoning token-class breakdown — dev-docs/ai-usage-metering-plan.md
 * §4.1, §5.2. One normalized jsonb bag (`ai_invocations.token_details`); shape
 * enforced here at the application layer, not the DB schema. Callers (structured.ts,
 * the turn route) are responsible for normalizing provider-specific
 * `providerMetadata` into this shape before calling computeUsage.
 *
 * `cachedInputTokens`/`reasoningTokens`/`audioInputTokens`/`imageInputTokens`
 * are SUBSETS the provider calls out of its blended input/output totals, as
 * reported by the SDK — never populated by this app. `textInputTokens`/
 * `textOutputTokens` are the *remainder* after those subsets are carved out
 * (see `disaggregateInputTokens`/`disaggregateOutputTokens` below) — this app
 * computes and fills them in before storage, so `token_details` is a full,
 * self-consistent partition of the blended prompt/completion totals, not
 * just the "special" classes. `ai_invocations` has no separate
 * prompt_tokens/completion_tokens/total_tokens columns — this jsonb bag is
 * the only persisted record of token counts; sum its fields to recover the
 * old blended totals.
 */
export interface TokenDetails {
  /** Blended input total minus every other *InputTokens field below — what actually bills at the plain `input_token` rate. */
  textInputTokens?: number;
  cachedInputTokens?: number;
  audioInputTokens?: number;
  imageInputTokens?: number;
  /** Blended output total minus `reasoningTokens` — what actually bills at the plain `output_token` rate. */
  textOutputTokens?: number;
  reasoningTokens?: number;
}

/** usage_types whose `token_details`/blended input-output totals are meaningful (§4.2: everything else has no LLM tokens). */
export function usageTypeHasTokenMetrics(usageType: UsageType): boolean {
  return usageType === "text_generation" || usageType === "realtime_dialogue" || usageType === "embedding";
}

/**
 * Splits a blended input-token total into its known subsets plus the
 * remainder. Shared by `contributionsForUsage` (billing — must carve the
 * subsets OUT of the blended total or double-bill them, see below) and
 * `completeAiInvocation` (storage — builds the full `token_details` picture)
 * so the two never drift apart on the same arithmetic.
 */
export function disaggregateInputTokens(
  totalInputTokens: number | null | undefined,
  details: TokenDetails | null | undefined,
): Pick<TokenDetails, "textInputTokens" | "cachedInputTokens" | "audioInputTokens" | "imageInputTokens"> {
  const cachedInputTokens = details?.cachedInputTokens;
  const audioInputTokens = details?.audioInputTokens;
  const imageInputTokens = details?.imageInputTokens;
  const textInputTokens =
    totalInputTokens != null
      ? Math.max(
          0,
          totalInputTokens - (cachedInputTokens ?? 0) - (audioInputTokens ?? 0) - (imageInputTokens ?? 0),
        )
      : undefined;
  return {
    ...(textInputTokens != null ? { textInputTokens } : {}),
    ...(cachedInputTokens != null ? { cachedInputTokens } : {}),
    ...(audioInputTokens != null ? { audioInputTokens } : {}),
    ...(imageInputTokens != null ? { imageInputTokens } : {}),
  };
}

/** Output-token counterpart of `disaggregateInputTokens` — see its doc comment. */
export function disaggregateOutputTokens(
  totalOutputTokens: number | null | undefined,
  details: TokenDetails | null | undefined,
): Pick<TokenDetails, "textOutputTokens" | "reasoningTokens"> {
  const reasoningTokens = details?.reasoningTokens;
  const textOutputTokens =
    totalOutputTokens != null ? Math.max(0, totalOutputTokens - (reasoningTokens ?? 0)) : undefined;
  return {
    ...(textOutputTokens != null ? { textOutputTokens } : {}),
    ...(reasoningTokens != null ? { reasoningTokens } : {}),
  };
}

export interface RawUsageMetrics {
  inputTokens?: number | null;
  outputTokens?: number | null;
  tokenDetails?: TokenDetails | null;
  audioSeconds?: number | null; // STT input duration
  characters?: number | null; // TTS input characters
  audioOutputSeconds?: number | null; // TTS/realtime synthesized audio duration
  sessionSeconds?: number | null; // realtime session length
  /**
   * STT providers that bill by token (e.g. OpenAI's gpt-4o-mini-transcribe:
   * $1.25/1M audio-input tokens, $5.00/1M output text tokens) report exact
   * token counts distinct from `inputTokens`/`outputTokens` above, which are
   * reserved for the blended LLM totals `usageTypeHasTokenMetrics` covers.
   * When present, these take priority over `audioSeconds` for pricing — see
   * `contributionsForUsage`'s speech_to_text branch.
   */
  sttAudioInputTokens?: number | null;
  sttOutputTokens?: number | null;
}

export interface ComputedUsage {
  /** Backend-only ledger; never rounded/floored (§4.4). Null = cannot be priced yet (§4.4 rule 3). */
  costUsd: number | null;
  /** cost_usd * creditsPerUsd (per rate version), exact, never rounded at write time. */
  credits: number | null;
  rateVersion: string;
  /** True when at least one contributing metric had no resolvable rate — callers should logAppEvent a warn. */
  missingRate: boolean;
  /**
   * Provider-native cost (e.g. Cartesia credits, Sarvam INR) for this row,
   * when every resolved rate that contributed to `costUsd` shares the same
   * `RateEntry.native.unit`. Reconcilable directly against the provider's
   * own invoice/dashboard, independent of whether the USD conversion
   * (`native.usdPerNativeUnit`) is currently accurate — see rates.ts's
   * `NativeRateInfo`. Null when no contributing rate is native-tracked, or
   * when contributions mix more than one native unit (rare; falls back to
   * cost_usd/credits only).
   */
  nativeCostUnits: number | null;
  /** The native unit `nativeCostUnits` is denominated in (e.g. `"cartesia_credit"`, `"inr"`); null iff `nativeCostUnits` is null. */
  nativeUnit: string | null;
}

interface MetricContribution {
  metric: RateMetric;
  units: number;
}

function contributionsForUsage(usageType: UsageType, raw: RawUsageMetrics): MetricContribution[] {
  const contributions: MetricContribution[] = [];

  if (usageTypeHasTokenMetrics(usageType)) {
    // `raw.inputTokens`/`raw.outputTokens` are BLENDED TOTALS, not "everything
    // except the token_details breakdown" — the AI SDK maps them straight from
    // the provider's total prompt/completion token count (asLanguageModelUsage:
    // `inputTokens: usage.inputTokens.total`), and e.g. Gemini's total already
    // sums TEXT+AUDIO+IMAGE modalities and cached tokens together
    // (convertGoogleGenerativeAIUsage's `promptTokenCount`). `tokenDetails`
    // reports SUBSETS of that same total, not additional tokens alongside it,
    // so the class-specific contributions must be carved OUT of the blended
    // total before it becomes the `input_token`/`output_token` contribution —
    // otherwise a cached/audio/image/reasoning token gets billed twice: once
    // in the blended line, again at its own rate. (Models with no dedicated
    // rate for a class fall back to the blended input_token/output_token rate
    // anyway — see FALLBACK_METRIC in rates.ts — so this nets out to the same
    // total cost for them; it only changes pricing for models that define a
    // real divergent rate, e.g. gpt-5.4's cached_input_token discount or
    // gemini-3-flash-preview's audio_input_token premium.)
    const inputSplit = disaggregateInputTokens(raw.inputTokens, raw.tokenDetails);
    if (inputSplit.textInputTokens) {
      contributions.push({ metric: "input_token", units: inputSplit.textInputTokens });
    }
    if (inputSplit.cachedInputTokens) {
      contributions.push({ metric: "cached_input_token", units: inputSplit.cachedInputTokens });
    }
    if (inputSplit.audioInputTokens) {
      contributions.push({ metric: "audio_input_token", units: inputSplit.audioInputTokens });
    }
    if (inputSplit.imageInputTokens) {
      contributions.push({ metric: "image_input_token", units: inputSplit.imageInputTokens });
    }

    const outputSplit = disaggregateOutputTokens(raw.outputTokens, raw.tokenDetails);
    if (outputSplit.textOutputTokens) {
      contributions.push({ metric: "output_token", units: outputSplit.textOutputTokens });
    }
    if (outputSplit.reasoningTokens) {
      contributions.push({ metric: "reasoning_token", units: outputSplit.reasoningTokens });
    }
  }

  if (usageType === "speech_to_text") {
    // Prefer exact provider-billed tokens (OpenAI) over a duration-based
    // approximation — audio_second is a fallback for providers that only
    // ever report duration (Cartesia, Sarvam), not a second billing
    // dimension alongside tokens for the same call.
    if (raw.sttAudioInputTokens || raw.sttOutputTokens) {
      if (raw.sttAudioInputTokens) {
        contributions.push({ metric: "audio_input_token", units: raw.sttAudioInputTokens });
      }
      if (raw.sttOutputTokens) {
        contributions.push({ metric: "output_token", units: raw.sttOutputTokens });
      }
    } else if (raw.audioSeconds) {
      contributions.push({ metric: "audio_second", units: raw.audioSeconds });
    }
  }

  if (usageType === "text_to_speech") {
    // Mutually exclusive, not additive: `character` and `audio_output_second`
    // are alternative billing metrics a provider might use, not two
    // simultaneously-billed dimensions — e.g. Cartesia bills per character
    // only, but its streaming sessions report L16 audio duration too
    // (computeAudioOutputMs), so both raw metrics are routinely non-zero on
    // the same row. Contributing both would double-bill any model priced on
    // both, and flags a false missingRate whenever only one is actually
    // priced (as with cartesia-sonic-3-5, which has no audio_output_second
    // rate because it doesn't need one). `character` wins when present since
    // every current provider prices by it; audio_output_second is the
    // fallback for a hypothetical duration-only-billed provider.
    if (raw.characters) {
      contributions.push({ metric: "character", units: raw.characters });
    } else if (raw.audioOutputSeconds) {
      contributions.push({ metric: "audio_output_second", units: raw.audioOutputSeconds });
    }
  }

  if (usageType === "realtime_dialogue" && raw.sessionSeconds) {
    contributions.push({ metric: "session_second", units: raw.sessionSeconds });
  }

  return contributions;
}

/**
 * raw metrics -> cost_usd (rawUnits x usdPerUnit) -> credits (cost_usd x
 * creditsPerUsd, resolved at the same rate version). Both computed to full precision, never rounded or
 * floored (§4.4). Never throws — an unpriceable model/metric degrades to
 * null cost/credits, not a blocked call (§4.4 rule 3, §7.4).
 */
/**
 * usage_types billed on a single non-token metric (audio seconds/characters/
 * session seconds), not LLM tokens. Unlike `text_generation`'s token counts
 * (effectively always present when the SDK returns a result), a zero-
 * contribution result for one of these always means the metric was missing
 * or unmeasured (e.g. a provider that reports no duration and no client
 * fallback was sent) — never a legitimate "nothing to bill" case, since the
 * call itself only exists because that modality was used. Silently returning
 * `missingRate: false` here let a real STT pricing gap go undetected with no
 * `app_logs` signal at all — see dev-docs/ai-usage-metering-phase2-plan.md's
 * "speech_to_text not reaching ai_usage_counters" investigation.
 */
const NON_TOKEN_METRIC_USAGE_TYPES = new Set<UsageType>([
  "speech_to_text",
  "text_to_speech",
  "realtime_dialogue",
]);

export function computeUsage(input: {
  catalogModelId: string;
  usageType: UsageType;
  metrics: RawUsageMetrics;
  /** Defaults to the current rate version; pass a historical version to reproduce an old row's pricing (§4.4 rule 4). */
  rateVersion?: string;
}): ComputedUsage {
  const rateVersion = input.rateVersion ?? CURRENT_RATE_VERSION;
  const contributions = contributionsForUsage(input.usageType, input.metrics);
  if (contributions.length === 0) {
    const missingRate = NON_TOKEN_METRIC_USAGE_TYPES.has(input.usageType);
    return { costUsd: null, credits: null, rateVersion, missingRate, nativeCostUnits: null, nativeUnit: null };
  }

  let costUsd = 0;
  let resolvedCount = 0;
  const nativeByUnit = new Map<string, number>();
  for (const { metric, units } of contributions) {
    const rate = resolveRate(input.catalogModelId, metric, rateVersion);
    if (!rate) continue;
    costUsd += units * rate.usdPerUnit;
    resolvedCount += 1;
    if (rate.native) {
      const prior = nativeByUnit.get(rate.native.unit) ?? 0;
      nativeByUnit.set(rate.native.unit, prior + units * rate.native.nativeUnitsPerRawUnit);
    }
  }

  if (resolvedCount === 0) {
    // Model is unpriced or entirely unknown at runtime — never block the call.
    return { costUsd: null, credits: null, rateVersion, missingRate: true, nativeCostUnits: null, nativeUnit: null };
  }

  // Only surface a native total when every native-tracked contribution agreed on one unit —
  // mixing e.g. Cartesia credits and INR on one row would be nonsensical to sum.
  const nativeUnits = [...nativeByUnit.keys()];
  const nativeUnit = nativeUnits.length === 1 ? nativeUnits[0] : null;
  const nativeCostUnits = nativeUnit ? (nativeByUnit.get(nativeUnit) ?? null) : null;

  const creditsPerUsd = getCreditsPerUsd(rateVersion);
  const missingRate = resolvedCount < contributions.length || creditsPerUsd === null;
  return {
    costUsd,
    credits: creditsPerUsd !== null ? costUsd * creditsPerUsd : null,
    rateVersion,
    missingRate,
    nativeCostUnits,
    nativeUnit,
  };
}
