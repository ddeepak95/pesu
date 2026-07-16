import "server-only";

import type { AiInvocationModelMeta } from "@/lib/ai/logging/types";
import {
  completeAiInvocation,
  failAiInvocation,
  startAiInvocation,
} from "@/lib/ai/logging/recordInvocation";
import type { ModelCatalogEntry } from "@/lib/ai/catalog/types";
import {
  getSttProvider,
  getTtsProvider,
} from "@/lib/konvo-voice/speech/registry";
import { CartesiaTtsContinuationSession } from "@/lib/konvo-voice/speech/providers/cartesia/ws-continuation";
import { CARTESIA_TTS_MIME } from "@/lib/konvo-voice/speech/providers/cartesia/tts";
import {
  SarvamTtsWebSocketSession,
  SARVAM_WS_TTS_MIME,
} from "@/lib/konvo-voice/speech/providers/sarvam/ws-stream";
import { resolveProviderApiKeyWithSourceForAssignment } from "@/lib/konvo-voice/speech/resolveProviderKey";
import { withRetry } from "@/lib/ai/retry";
import { assertClassAiAccessAllowed, assertPlatformAiAccessAllowed } from "@/lib/ai/metering/access";
import { keyOwnerFromSource } from "@/lib/ai/metering/keyOwner";
import { assertWithinQuota, resolveWalletId } from "@/lib/ai/metering/quota";
import { resolveInstitutionId } from "@/lib/logging/appLog";
import { createServiceRoleClient } from "@/lib/supabase-server";
import type { AiConfigSource } from "@/types/aiSettings";
import type {
  SttProvider,
  SynthesizeInput,
  SynthesizeResult,
  TranscribeInput,
  TranscribeResult,
  TtsProvider,
  TtsStreamFormat,
} from "@/lib/konvo-voice/speech/types";
import type { AiCallContext } from "./model";

export interface MeteredSttClient {
  readonly modelMeta: AiInvocationModelMeta;
  /** Writes its own ai_invocations row (speech_to_text). */
  transcribe(
    input: TranscribeInput,
  ): Promise<TranscribeResult & { invocationId: string | null }>;
}

export interface MeteredTtsSession {
  /**
   * The session's actual streaming audio format — not necessarily the same
   * as MeteredTtsClient.streamFormat (Sarvam's batch endpoint returns WAV;
   * its WS session streams raw L16 PCM at the same sample rate).
   */
  readonly streamFormat: TtsStreamFormat;
  pushText(text: string, opts?: { continueGeneration?: boolean }): void;
  consumeAudio(): AsyncGenerator<Uint8Array>;
  /** Finalizes the row with whatever was actually pushed/consumed — call on abort too. */
  close(): Promise<void>;
}

export interface MeteredTtsClient {
  readonly streamFormat: TtsStreamFormat;
  synthesize(input: SynthesizeInput): Promise<SynthesizeResult>;
  synthesizeStream?(input: SynthesizeInput): AsyncIterable<Uint8Array>;
  openSynthesisSession(opts: { language?: string; voice?: string }): Promise<MeteredTtsSession>;
}

/** Raw PCM (16-bit, mono) is exact for Cartesia/Sarvam/OpenAI's `pcm` format (§5.1). */
const PCM_BYTES_PER_SAMPLE = 2;

function computeAudioOutputMs(bytes: number, sampleRate: number, mimeType: string): number | null {
  if (!mimeType.toLowerCase().includes("l16")) return null;
  if (bytes <= 0 || sampleRate <= 0) return 0;
  return Math.round((bytes / PCM_BYTES_PER_SAMPLE / sampleRate) * 1000);
}

function contextInvocationFields(
  context: AiCallContext,
  institutionId: string | null,
  walletId: string | null,
) {
  return {
    classId: context.classDbId,
    assignmentId: context.assignmentId,
    submissionId: context.submissionId,
    questionOrder: context.questionOrder,
    questionId: context.questionId,
    attemptNumber: context.attemptNumber,
    attemptId: context.attemptId,
    sessionId: context.sessionId,
    userId: context.userId,
    institutionId,
    walletId,
  };
}

class MeteredSttClientImpl implements MeteredSttClient {
  constructor(
    private readonly provider: SttProvider,
    private readonly apiModelId: string | undefined,
    private readonly apiKey: string | null,
    readonly modelMeta: AiInvocationModelMeta,
    private readonly context: AiCallContext,
    private readonly institutionId: string | null,
    private readonly walletId: string | null,
  ) {}

  async transcribe(
    input: TranscribeInput,
  ): Promise<TranscribeResult & { invocationId: string | null }> {
    const startedAtMs = Date.now();
    const invocationId = await startAiInvocation({
      appFunctionKey: "speech_to_text",
      usageType: "speech_to_text",
      model: this.modelMeta,
      ...contextInvocationFields(this.context, this.institutionId, this.walletId),
      sdkRequest: {
        filename: input.filename,
        mimeType: input.mimeType,
        language: input.language,
      },
    });

    try {
      // Internal retries (provider-cost-free failures only) stay inside this
      // one logical operation — one row per transcribe() call, not per
      // attempt (§5.0 row 4: STT/TTS retries aren't surfaced as separate rows,
      // unlike text generation's per-attempt logging).
      const result = await withRetry(
        () =>
          this.provider.transcribe({
            ...input,
            apiModelId: this.apiModelId,
            providerApiKey: this.apiKey ?? undefined,
          }),
        3,
      );

      if (invocationId) {
        const usage = result.usage;
        const audioMs = usage?.audioMs ?? input.fallbackAudioMs ?? null;
        const metricSource = usage?.audioMs != null ? usage.source : audioMs != null ? "estimated" : null;
        await completeAiInvocation(
          invocationId,
          {
            sdkResponse: { text: result.text, usage: usage ?? null },
            audioMs,
            metricSource,
            providerRequestId: usage?.providerRequestId ?? null,
            // Token-billed providers (OpenAI) report exact billed tokens —
            // computeUsage prices off these in preference to audioMs/audioSeconds
            // when present (see contributionsForUsage's speech_to_text branch).
            sttAudioInputTokens: usage?.providerTokens?.audio ?? null,
            sttOutputTokens: usage?.providerTokens?.output ?? null,
          },
          startedAtMs,
        );
      }
      return { ...result, invocationId };
    } catch (err) {
      if (invocationId) {
        await failAiInvocation(invocationId, err, startedAtMs);
      }
      throw err;
    }
  }
}

class MeteredTtsClientImpl implements MeteredTtsClient {
  readonly streamFormat: TtsStreamFormat;
  readonly synthesizeStream?: (input: SynthesizeInput) => AsyncIterable<Uint8Array>;

  constructor(
    private readonly provider: TtsProvider,
    private readonly catalogModelId: string,
    private readonly apiModelId: string | undefined,
    private readonly apiKey: string | null,
    private readonly modelMeta: AiInvocationModelMeta,
    private readonly context: AiCallContext,
    private readonly institutionId: string | null,
    private readonly walletId: string | null,
  ) {
    this.streamFormat = provider.streamFormat;
    if (provider.synthesizeStream) {
      this.synthesizeStream = (input: SynthesizeInput) =>
        this.streamAndMeter(provider.synthesizeStream!.bind(provider), input);
    }
  }

  private startTtsInvocation(extra?: Record<string, unknown>): Promise<string | null> {
    return startAiInvocation({
      appFunctionKey: "text_to_speech",
      usageType: "text_to_speech",
      model: this.modelMeta,
      ...contextInvocationFields(this.context, this.institutionId, this.walletId),
      sdkRequest: extra ?? {},
    });
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const startedAtMs = Date.now();
    const characters = input.text.trim().length;
    const invocationId = await this.startTtsInvocation({
      characters,
      voice: input.voice,
      language: input.language,
    });

    try {
      const result = await this.provider.synthesize({
        ...input,
        apiModelId: this.apiModelId,
        providerApiKey: this.apiKey ?? undefined,
      });

      if (invocationId) {
        const audioOutputMs = computeAudioOutputMs(
          result.audio.byteLength,
          this.streamFormat.sampleRate,
          result.mimeType,
        );
        await completeAiInvocation(
          invocationId,
          {
            sdkResponse: { mimeType: result.mimeType, bytes: result.audio.byteLength },
            characters,
            audioOutputMs,
            metricSource: "measured",
          },
          startedAtMs,
        );
      }
      return result;
    } catch (err) {
      if (invocationId) {
        await failAiInvocation(invocationId, err, startedAtMs);
      }
      throw err;
    }
  }

  private async *streamAndMeter(
    fn: (input: SynthesizeInput) => AsyncIterable<Uint8Array>,
    input: SynthesizeInput,
  ): AsyncGenerator<Uint8Array> {
    const startedAtMs = Date.now();
    const characters = input.text.trim().length;
    const invocationId = await this.startTtsInvocation({
      characters,
      voice: input.voice,
      language: input.language,
      streamed: true,
    });

    let bytes = 0;
    try {
      for await (const chunk of fn({
        ...input,
        apiModelId: this.apiModelId,
        providerApiKey: this.apiKey ?? undefined,
      })) {
        bytes += chunk.byteLength;
        yield chunk;
      }
      if (invocationId) {
        const audioOutputMs = computeAudioOutputMs(bytes, this.streamFormat.sampleRate, this.streamFormat.mimeType);
        await completeAiInvocation(
          invocationId,
          { sdkResponse: { bytes }, characters, audioOutputMs, metricSource: "measured" },
          startedAtMs,
        );
      }
    } catch (err) {
      if (invocationId) {
        await failAiInvocation(invocationId, err, startedAtMs);
      }
      throw err;
    }
  }

  async openSynthesisSession(opts: { language?: string; voice?: string }): Promise<MeteredTtsSession> {
    const startedAtMs = Date.now();
    const invocationId = await this.startTtsInvocation({
      sessionKind: this.catalogModelId,
      voice: opts.voice,
      language: opts.language,
      streamed: true,
      session: true,
    });

    let charactersPushed = 0;
    let bytesConsumed = 0;
    let finalized = false;

    // Set per-provider below — the session's actual streaming format, which
    // can differ from this.streamFormat (the batch endpoint's format; Sarvam's
    // WS session streams raw L16 while its batch endpoint returns WAV).
    let sessionStreamFormat: TtsStreamFormat = this.streamFormat;

    const finalize = async () => {
      if (finalized) return;
      finalized = true;
      if (!invocationId) return;
      const audioOutputMs = computeAudioOutputMs(
        bytesConsumed,
        sessionStreamFormat.sampleRate,
        sessionStreamFormat.mimeType,
      );
      await completeAiInvocation(
        invocationId,
        {
          sdkResponse: { bytes: bytesConsumed },
          characters: charactersPushed,
          audioOutputMs,
          metricSource: "measured",
        },
        startedAtMs,
      );
    };

    const providerId = this.provider.id;

    if (providerId === "cartesia") {
      let session: CartesiaTtsContinuationSession;
      try {
        session = await CartesiaTtsContinuationSession.open({
          modelId: this.apiModelId ?? this.catalogModelId,
          voiceId: opts.voice ?? "",
          language: opts.language ?? "en",
          apiKey: this.apiKey ?? undefined,
        });
      } catch (err) {
        if (invocationId) await failAiInvocation(invocationId, err, startedAtMs);
        throw err;
      }

      sessionStreamFormat = { mimeType: CARTESIA_TTS_MIME, sampleRate: session.sampleRate };

      return {
        streamFormat: sessionStreamFormat,
        pushText: (text, pushOpts) => {
          charactersPushed += text.length;
          session.pushTranscript(text, pushOpts?.continueGeneration ?? true);
        },
        consumeAudio: async function* () {
          for await (const chunk of session.consumeAudio()) {
            bytesConsumed += chunk.byteLength;
            yield chunk;
          }
        },
        close: async () => {
          session.close();
          await finalize();
        },
      };
    }

    if (providerId === "sarvam") {
      let session: SarvamTtsWebSocketSession;
      try {
        session = await SarvamTtsWebSocketSession.open({
          modelId: this.apiModelId ?? this.catalogModelId,
          speaker: opts.voice ?? "",
          language: opts.language ?? "en",
          apiKey: this.apiKey ?? undefined,
        });
      } catch (err) {
        if (invocationId) await failAiInvocation(invocationId, err, startedAtMs);
        throw err;
      }

      sessionStreamFormat = { mimeType: SARVAM_WS_TTS_MIME, sampleRate: session.sampleRate };

      return {
        streamFormat: sessionStreamFormat,
        pushText: (text, pushOpts) => {
          charactersPushed += text.length;
          session.pushText(text);
          if (pushOpts?.continueGeneration === false) session.flush();
        },
        consumeAudio: async function* () {
          for await (const chunk of session.consumeAudio()) {
            bytesConsumed += chunk.byteLength;
            yield chunk;
          }
        },
        close: async () => {
          session.close();
          await finalize();
        },
      };
    }

    const err = new Error(`No streaming TTS session support for provider "${providerId}".`);
    if (invocationId) await failAiInvocation(invocationId, err, startedAtMs);
    throw err;
  }
}

/**
 * Resolve a metered speech handle. Key custody (decrypting the effective
 * provider API key and its supplying scope) happens here, once — call sites
 * never see a raw key (§7.1, §7.2).
 */
export async function resolveMeteredSpeech(input: {
  kind: "stt";
  catalogEntry: ModelCatalogEntry;
  /** null = no assignment context (prototype/dev flows) — falls back to platform env keys. */
  assignmentId: string | null;
  context: AiCallContext;
}): Promise<MeteredSttClient>;
export async function resolveMeteredSpeech(input: {
  kind: "tts";
  catalogEntry: ModelCatalogEntry;
  assignmentId: string | null;
  context: AiCallContext;
}): Promise<MeteredTtsClient>;
export async function resolveMeteredSpeech(input: {
  kind: "stt" | "tts";
  catalogEntry: ModelCatalogEntry;
  assignmentId: string | null;
  context: AiCallContext;
}): Promise<MeteredSttClient | MeteredTtsClient> {
  const { apiKey, keySource } = input.assignmentId
    ? await resolveProviderApiKeyWithSourceForAssignment(
        input.assignmentId,
        input.catalogEntry.providerId,
      )
    : { apiKey: null, keySource: "env" as const };
  const modelMeta: AiInvocationModelMeta = {
    provider: input.catalogEntry.providerId,
    // Catalog id, not apiModelId — keeps ai_model_id aligned with the rate
    // card, which is keyed off the catalog (§4.4).
    modelId: input.catalogEntry.id,
    keySource,
  };

  // Quota enforcement (D2, D6) — mirrors resolveMeteredModel: institutionId/
  // walletId resolved once here, right after keySource is known and before
  // the handle is constructed; the per-call balance check is skipped for
  // calls already admitted at session start or explicitly ride-through.
  const classDbId = input.context.classDbId;
  const institutionId = classDbId
    ? await resolveInstitutionId(createServiceRoleClient(), classDbId)
    : null;

  let walletId: string | null = null;
  if (institutionId && classDbId) {
    const keyOwner = keyOwnerFromSource(keySource);

    // Real-time kill switch (decision 1) — see the matching comment in
    // resolveMeteredModel (model.ts). Checked on every call that isn't using
    // the class's own key.
    if (keyOwner === "platform") {
      await assertPlatformAiAccessAllowed(institutionId);
    }
    if (keySource !== "class") {
      await assertClassAiAccessAllowed(classDbId);
    }

    walletId = await resolveWalletId({ institutionId, classId: classDbId, keyOwner });

    const shouldCheck =
      input.context.admittedAtSessionStart !== true &&
      input.context.quotaPolicy !== "ride-through";
    if (shouldCheck) {
      await assertWithinQuota({ institutionId, classId: classDbId, keyOwner });
    }
  }

  if (input.kind === "stt") {
    const provider = getSttProvider(input.catalogEntry.id);
    return new MeteredSttClientImpl(
      provider,
      input.catalogEntry.apiModelId,
      apiKey,
      modelMeta,
      input.context,
      institutionId,
      walletId,
    );
  }

  const provider = getTtsProvider(input.catalogEntry.id);
  return new MeteredTtsClientImpl(
    provider,
    input.catalogEntry.id,
    input.catalogEntry.apiModelId,
    apiKey,
    modelMeta,
    input.context,
    institutionId,
    walletId,
  );
}

/**
 * Resolves only the key_owner-determining keySource for a speech provider —
 * never the decrypted API key itself. Exists so session-start admission
 * (assertSessionCanStart, dev-docs/ai-usage-metering-phase3-plan.md D6) can
 * learn which wallet an STT/TTS surface would debit without importing the
 * restricted speech-provider-key module directly (§7.2 import boundary) —
 * that module may only be touched inside src/lib/ai/gateway/**.
 */
export async function resolveSpeechKeySource(
  providerId: ModelCatalogEntry["providerId"],
  assignmentId: string,
): Promise<AiConfigSource> {
  const { keySource } = await resolveProviderApiKeyWithSourceForAssignment(
    assignmentId,
    providerId,
  );
  return keySource;
}
