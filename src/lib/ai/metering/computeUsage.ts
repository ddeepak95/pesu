import { CURRENT_RATE_VERSION, getCreditsPerUsd, resolveRate, type RateMetric } from "@/lib/ai/metering/rates";
import type { UsageType } from "@/lib/ai/metering/usageTypes";

/**
 * Per-modality / cached / reasoning token-class breakdown — dev-docs/ai-usage-metering-plan.md
 * §4.1, §5.2. One normalized jsonb bag (`ai_invocations.token_details`); shape
 * enforced here at the application layer, not the DB schema. Callers (structured.ts,
 * the turn route) are responsible for normalizing provider-specific
 * `providerMetadata` into this shape before calling computeUsage.
 */
export interface TokenDetails {
  cachedInputTokens?: number;
  reasoningTokens?: number;
  audioInputTokens?: number;
  imageInputTokens?: number;
}

export interface RawUsageMetrics {
  inputTokens?: number | null;
  outputTokens?: number | null;
  tokenDetails?: TokenDetails | null;
  audioSeconds?: number | null; // STT input duration
  characters?: number | null; // TTS input characters
  audioOutputSeconds?: number | null; // TTS/realtime synthesized audio duration
  sessionSeconds?: number | null; // realtime session length
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

  if (usageType === "text_generation" || usageType === "realtime_dialogue" || usageType === "embedding") {
    if (raw.inputTokens) contributions.push({ metric: "input_token", units: raw.inputTokens });
    if (raw.outputTokens) contributions.push({ metric: "output_token", units: raw.outputTokens });
    const details = raw.tokenDetails;
    if (details?.cachedInputTokens) {
      contributions.push({ metric: "cached_input_token", units: details.cachedInputTokens });
    }
    if (details?.reasoningTokens) {
      contributions.push({ metric: "reasoning_token", units: details.reasoningTokens });
    }
    if (details?.audioInputTokens) {
      contributions.push({ metric: "audio_input_token", units: details.audioInputTokens });
    }
    if (details?.imageInputTokens) {
      contributions.push({ metric: "image_input_token", units: details.imageInputTokens });
    }
  }

  if (usageType === "speech_to_text" && raw.audioSeconds) {
    contributions.push({ metric: "audio_second", units: raw.audioSeconds });
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
    return { costUsd: null, credits: null, rateVersion, missingRate: false, nativeCostUnits: null, nativeUnit: null };
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
